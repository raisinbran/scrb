// Offline recognition-copy filter: runs the pinned WebRTC audio processing module over a COPY of the
// mic track, using the meeting track as the far-end reference. Inputs are opened read-only and the
// output must be a new file, so neither saved original can be changed by this program.
#include "api/scoped_refptr.h"
#include "api/audio/echo_canceller3_config.h"
#include "api/audio/echo_control.h"
#include "modules/audio_processing/aec3/echo_canceller3.h"
#include <webrtc-audio-processing/webrtc/modules/audio_processing/include/audio_processing.h>

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <optional>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

// AEC3 with a longer adaptive filter, for rooms whose echo spreads past the 52 ms default.
class LongTailFactory : public webrtc::EchoControlFactory {
 public:
  explicit LongTailFactory(size_t blocks) : blocks_(blocks) {}
  std::unique_ptr<webrtc::EchoControl> Create(int rate, int render, int capture) override {
    webrtc::EchoCanceller3Config c;
    c.filter.refined.length_blocks = blocks_;
    c.filter.coarse.length_blocks = blocks_;
    c.filter.refined_initial.length_blocks = std::min<size_t>(12, blocks_);
    c.filter.coarse_initial.length_blocks = std::min<size_t>(12, blocks_);
    c.ep_strength.default_len = 0.9f;
    webrtc::EchoCanceller3Config::Validate(&c);
    return std::make_unique<webrtc::EchoCanceller3>(c, std::nullopt, rate, render, capture);
  }
 private:
  size_t blocks_;
};

struct Wav {
  int rate = 0;
  std::vector<int16_t> samples;
};

static bool ReadWav(const std::string& path, Wav& out, std::string& err) {
  std::ifstream f(path, std::ios::binary);
  if (!f) { err = "cannot open " + path; return false; }
  std::vector<char> b((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
  if (b.size() < 44 || std::memcmp(b.data(), "RIFF", 4) != 0 || std::memcmp(b.data() + 8, "WAVE", 4) != 0) {
    err = "not a WAV file: " + path; return false;
  }
  bool haveFmt = false;
  size_t pos = 12;
  while (pos + 8 <= b.size()) {
    uint32_t size;
    std::memcpy(&size, b.data() + pos + 4, 4);
    const char* id = b.data() + pos;
    const size_t body = pos + 8;
    if (std::memcmp(id, "fmt ", 4) == 0 && body + 16 <= b.size()) {
      uint16_t fmt, ch, bits;
      uint32_t rate;
      std::memcpy(&fmt, b.data() + body, 2);
      std::memcpy(&ch, b.data() + body + 2, 2);
      std::memcpy(&rate, b.data() + body + 4, 4);
      std::memcpy(&bits, b.data() + body + 14, 2);
      if (fmt != 1 || ch != 1 || bits != 16) { err = "need 16-bit mono PCM: " + path; return false; }
      out.rate = static_cast<int>(rate);
      haveFmt = true;
    } else if (std::memcmp(id, "data", 4) == 0 && haveFmt) {
      size_t n = std::min<size_t>(size, b.size() - body) / 2;
      out.samples.resize(n);
      std::memcpy(out.samples.data(), b.data() + body, n * 2);
      return true;
    }
    pos = body + size + (size & 1);
  }
  err = "no data chunk: " + path;
  return false;
}

static bool WriteWav(const std::string& path, int rate, const std::vector<int16_t>& s) {
  std::ofstream f(path, std::ios::binary | std::ios::trunc);
  if (!f) return false;
  uint32_t dataBytes = static_cast<uint32_t>(s.size() * 2), riff = 36 + dataBytes, fmtSize = 16;
  uint32_t byteRate = static_cast<uint32_t>(rate) * 2, r = static_cast<uint32_t>(rate);
  uint16_t pcm = 1, ch = 1, align = 2, bits = 16;
  f.write("RIFF", 4); f.write(reinterpret_cast<char*>(&riff), 4); f.write("WAVEfmt ", 8);
  f.write(reinterpret_cast<char*>(&fmtSize), 4); f.write(reinterpret_cast<char*>(&pcm), 2);
  f.write(reinterpret_cast<char*>(&ch), 2); f.write(reinterpret_cast<char*>(&r), 4);
  f.write(reinterpret_cast<char*>(&byteRate), 4); f.write(reinterpret_cast<char*>(&align), 2);
  f.write(reinterpret_cast<char*>(&bits), 2); f.write("data", 4);
  f.write(reinterpret_cast<char*>(&dataBytes), 4);
  f.write(reinterpret_cast<const char*>(s.data()), static_cast<std::streamsize>(dataBytes));
  return static_cast<bool>(f);
}

static int Usage() {
  std::cerr << "usage: scrb-apm-filter --mic IN.wav --ref MEETING.wav --out NEW.wav "
               "[--ns off|low|moderate|high|veryhigh] [--aec on|off] [--agc on|off]\n";
  return 64;
}

int main(int argc, char** argv) {
  std::string mic, ref, out, ns = "moderate", aec = "on", agc = "off";
  int tailMs = 0;
  for (int i = 1; i + 1 < argc; i += 2) {
    std::string k = argv[i], v = argv[i + 1];
    if (k == "--mic") mic = v; else if (k == "--ref") ref = v; else if (k == "--out") out = v;
    else if (k == "--ns") ns = v; else if (k == "--aec") aec = v; else if (k == "--agc") agc = v; else if (k == "--aec-tail-ms") tailMs = std::atoi(v.c_str());
    else return Usage();
  }
  if (mic.empty() || ref.empty() || out.empty()) return Usage();

  std::error_code ec;
  const fs::path outAbs = fs::weakly_canonical(out, ec);
  for (const std::string& in : {mic, ref}) {
    std::error_code e2;
    if (fs::exists(outAbs) || (fs::exists(in, e2) && fs::equivalent(in, outAbs, e2))) {
      std::cerr << "refusing: output must be a new file, not an input\n";
      return 65;
    }
  }

  Wav m, r;
  std::string err;
  if (!ReadWav(mic, m, err) || !ReadWav(ref, r, err)) { std::cerr << err << "\n"; return 66; }
  if (m.rate != r.rate || m.rate % 100 != 0 || m.rate < 8000 || m.rate > 48000) {
    std::cerr << "rates must match and be a multiple of 100 Hz in 8-48 kHz\n";
    return 67;
  }

  webrtc::AudioProcessing::Config cfg;
  cfg.echo_canceller.enabled = aec == "on";
  cfg.echo_canceller.mobile_mode = false;
  cfg.noise_suppression.enabled = ns != "off";
  cfg.noise_suppression.level = ns == "low" ? webrtc::AudioProcessing::Config::NoiseSuppression::kLow
      : ns == "high"     ? webrtc::AudioProcessing::Config::NoiseSuppression::kHigh
      : ns == "veryhigh" ? webrtc::AudioProcessing::Config::NoiseSuppression::kVeryHigh
                         : webrtc::AudioProcessing::Config::NoiseSuppression::kModerate;
  cfg.gain_controller2.enabled = agc == "on";
  cfg.gain_controller2.adaptive_digital.enabled = agc == "on";
  cfg.high_pass_filter.enabled = false;

  webrtc::AudioProcessingBuilder builder;
  if (tailMs > 52) builder.SetEchoControlFactory(std::make_unique<LongTailFactory>(static_cast<size_t>(tailMs / 4)));
  rtc::scoped_refptr<webrtc::AudioProcessing> apm = builder.Create();
  apm->ApplyConfig(cfg);

  const size_t frame = static_cast<size_t>(m.rate / 100);
  webrtc::StreamConfig sc(m.rate, 1);
  std::vector<int16_t> result(m.samples.size());
  std::vector<int16_t> a(frame), b(frame), o(frame);
  for (size_t at = 0; at < m.samples.size(); at += frame) {
    const size_t n = std::min(frame, m.samples.size() - at);
    std::fill(a.begin(), a.end(), 0);
    std::fill(b.begin(), b.end(), 0);
    std::memcpy(a.data(), m.samples.data() + at, n * 2);
    if (at < r.samples.size()) std::memcpy(b.data(), r.samples.data() + at, std::min(n, r.samples.size() - at) * 2);
    if (apm->ProcessReverseStream(b.data(), sc, sc, o.data()) != 0 ||
        apm->ProcessStream(a.data(), sc, sc, o.data()) != 0) {
      std::cerr << "APM processing failed\n";
      return 70;
    }
    std::memcpy(result.data() + at, o.data(), n * 2);
  }
  if (!WriteWav(outAbs.string(), m.rate, result)) { std::cerr << "cannot write output\n"; return 71; }
  return 0;
}
