// Checks a recorded session: walks every chunk's Ogg pages (CRC), decodes it,
// compares decoded frames with chunks.log, and reports signal per chunk.
// Usage: ChunkVerify.exe <dir holding audio/> [-v]
//        ChunkVerify.exe --levels <chunk> <hz>...   prints the frames, then each
//        tone's highest level in any half second
//        ChunkVerify.exe --pcm <chunk> <out>        writes the decoded 16-bit samples
#define _CRT_SECURE_NO_WARNINGS
#include <opus.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace {

uint32_t Crc(const uint8_t* d, size_t n) {
    static uint32_t t[256];
    if (!t[1])
        for (uint32_t i = 0; i < 256; ++i) {
            uint32_t r = i << 24;
            for (int b = 0; b < 8; ++b) r = (r & 0x80000000u) ? (r << 1) ^ 0x04c11db7u : r << 1;
            t[i] = r;
        }
    uint32_t c = 0;
    for (size_t i = 0; i < n; ++i) c = (c << 8) ^ t[((c >> 24) ^ d[i]) & 0xff];
    return c;
}

struct Decoded {
    bool ok = false;
    std::vector<int16_t> pcm;
};

Decoded DecodeChunk(const fs::path& path) {
    Decoded out;
    std::ifstream in(path, std::ios::binary);
    std::vector<uint8_t> f((std::istreambuf_iterator<char>(in)), {});
    int err = 0, preSkip = 0;
    OpusDecoder* dec = opus_decoder_create(48000, 1, &err);
    size_t pos = 0;
    int pageNo = 0;
    uint64_t lastGranule = 0;
    bool sawEos = false;
    std::vector<int16_t> buf(5760);
    while (pos + 27 <= f.size()) {
        if (memcmp(&f[pos], "OggS", 4)) { opus_decoder_destroy(dec); return out; }
        int segs = f[pos + 26];
        size_t bodyAt = pos + 27 + segs, body = 0;
        for (int i = 0; i < segs; ++i) body += f[pos + 27 + i];
        if (bodyAt + body > f.size()) { opus_decoder_destroy(dec); return out; }
        std::vector<uint8_t> page(f.begin() + pos, f.begin() + bodyAt + body);
        uint32_t stored;
        memcpy(&stored, &page[22], 4);
        memset(&page[22], 0, 4);
        if (Crc(page.data(), page.size()) != stored) { opus_decoder_destroy(dec); return out; }
        memcpy(&lastGranule, &f[pos + 6], 8);
        sawEos = (f[pos + 5] & 4) != 0;
        if (pageNo == 0) {
            preSkip = f[bodyAt + 10] | (f[bodyAt + 11] << 8);
        } else if (pageNo > 1) {
            size_t at = bodyAt, len = 0;
            for (int i = 0; i < segs; ++i) {
                len += f[pos + 27 + i];
                if (f[pos + 27 + i] < 255) {
                    int n = opus_decode(dec, &f[at], static_cast<opus_int32>(len), buf.data(), 5760, 0);
                    if (n > 0) out.pcm.insert(out.pcm.end(), buf.begin(), buf.begin() + n);
                    at += len;
                    len = 0;
                }
            }
        }
        pos = bodyAt + body;
        ++pageNo;
    }
    opus_decoder_destroy(dec);
    if (!sawEos || lastGranule < static_cast<uint64_t>(preSkip)) return out;
    size_t want = static_cast<size_t>(lastGranule) - preSkip;
    if (out.pcm.size() < want + preSkip) return out;
    out.pcm.erase(out.pcm.begin(), out.pcm.begin() + preSkip);
    out.pcm.resize(want);
    out.ok = true;
    return out;
}

double Goertzel(const std::vector<int16_t>& x, double hz) {
    double w = 2 * 3.14159265358979 * hz / 48000, c = 2 * cos(w), a = 0, b = 0;
    for (int16_t s : x) {
        double y = s + c * a - b;
        b = a;
        a = y;
    }
    return (a * a + b * b - c * a * b) / std::max<size_t>(x.size(), 1);
}

double ToneLevel(const std::vector<int16_t>& x, double hz) {
    double w = 2 * 3.14159265358979 * hz / 48000, c = 2 * cos(w), best = 0;
    for (size_t at = 0; at < x.size(); at += 24000) {
        size_t end = std::min(at + 24000, x.size());
        double a = 0, b = 0;
        for (size_t i = at; i < end; ++i) {
            double y = x[i] + c * a - b;
            b = a;
            a = y;
        }
        best = std::max(best, sqrt(std::max(a * a + b * b - c * a * b, 0.0)) / (end - at));
    }
    return best;
}

int Levels(int argc, char** argv) {
    Decoded d = DecodeChunk(argv[2]);
    if (!d.ok) { puts("BAD"); return 1; }
    printf("%zu", d.pcm.size());
    for (int i = 3; i < argc; ++i) printf(" %.1f", ToneLevel(d.pcm, atof(argv[i])));
    puts("");
    return 0;
}

int WritePcm(const char* chunk, const char* path) {
    Decoded d = DecodeChunk(chunk);
    if (!d.ok) { puts("BAD"); return 1; }
    std::ofstream out(path, std::ios::binary);
    out.write(reinterpret_cast<const char*>(d.pcm.data()), d.pcm.size() * sizeof(int16_t));
    return out ? 0 : 1;
}

std::string Field(const std::string& line, const std::string& key) {
    auto at = line.find("\"" + key + "\":");
    if (at == std::string::npos) return {};
    at += key.size() + 3;
    if (line[at] == '"') return line.substr(at + 1, line.find('"', at + 1) - at - 1);
    return line.substr(at, line.find_first_of(",}", at) - at);
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 2) return 2;
    if (argc > 3 && !strcmp(argv[1], "--levels")) return Levels(argc, argv);
    if (argc == 4 && !strcmp(argv[1], "--pcm")) return WritePcm(argv[2], argv[3]);
    bool verbose = argc > 2;
    int failures = 0;
    for (const char* track : {"microphone", "meeting"}) {
        fs::path dir = fs::path(argv[1]) / "audio" / track;
        std::ifstream index(dir / "chunks.log");
        std::string line;
        int chunks = 0, bad = 0, toneChunks = 0, zeroChunks = 0;
        double minutes = 0, missing = 0, wantSeq = 0;
        std::map<std::string, int> reasons;
        std::vector<std::string> gaps;
        int64_t nextStart = 0;
        double peakDb = -120;
        while (std::getline(index, line)) {
            if (line.find("\"file\"") == std::string::npos) continue;
            ++chunks;
            char name[32];
            int seq = atoi(Field(line, "seq").c_str());
            if (seq != wantSeq) { ++bad; printf("  seq gap at %d\n", seq); }
            wantSeq = seq + 1;
            snprintf(name, sizeof name, "%06d.opus", seq);
            Decoded d = DecodeChunk(dir / name);
            uint64_t frames = strtoull(Field(line, "frames").c_str(), nullptr, 10);
            if (!d.ok || d.pcm.size() != frames) {
                ++bad;
                printf("  BAD %s %s ok=%d decoded=%zu log=%llu\n", track, name, d.ok, d.pcm.size(), frames);
            }
            double sum = 0;
            for (int16_t s : d.pcm) sum += double(s) * s;
            double rms = sqrt(sum / std::max<size_t>(d.pcm.size(), 1));
            double db = rms > 0 ? 20 * log10(rms / 32768) : -120;
            peakDb = std::max(peakDb, db);
            bool tone = Goertzel(d.pcm, 880) > 20 * Goertzel(d.pcm, 1500) && db > -80;
            toneChunks += tone;
            zeroChunks += Field(line, "allZero") == "true";
            minutes += frames / 48000.0;
            double miss = atof(Field(line, "missingBeforeMs").c_str());
            int64_t start = strtoll(Field(line, "startNs").c_str(), nullptr, 10);
            if (miss > 0) {
                missing += miss;
                char g[120];
                snprintf(g, sizeof g, "    missing %.1f ms before %.3f s, cause %s", miss, start / 1e9,
                         Field(line, "missingCause").c_str());
                gaps.push_back(g);
            }
            int64_t overlap = int64_t(atof(Field(line, "overlapMs").c_str()) * 1000000);
            int64_t tolerance = Field(line, "transport") == "bluetooth-handsfree" ? 20000000 : 2000000;
            if (chunks > 1 && std::abs(start + overlap - nextStart) > tolerance && miss == 0) {
                ++bad;
                printf("  unexplained gap at seq %d\n", seq);
            }
            nextStart = start + int64_t(frames) * 1000000000 / 48000;
            reasons[Field(line, "closeReason")]++;
            if (verbose)
                printf("  %s %d start=%.3f s frames=%llu %.1f dB tone=%d open=%s close=%s\n", track, seq, start / 1e9,
                       frames, db, tone, Field(line, "openReason").c_str(), Field(line, "closeReason").c_str());
        }
        int tmp = 0, orphan = 0;
        if (fs::exists(dir))
            for (auto& e : fs::directory_iterator(dir)) {
                tmp += e.path().extension() == ".part";
                orphan += e.path().extension() == ".opus";
            }
        printf("%s: chunks=%d audio=%.1f s missing=%.1f ms bad=%d part=%d files=%d toneChunks=%d zeroChunks=%d peak=%.1f dB\n",
               track, chunks, minutes, missing, bad, tmp, orphan, toneChunks, zeroChunks, peakDb);
        printf("  close reasons:");
        for (auto& r : reasons) printf(" %s=%d", r.first.c_str(), r.second);
        puts("");
        size_t shown = 0;
        for (auto& g : gaps) if (shown++ < 12) puts(g.c_str());
        if (gaps.size() > 12) printf("    ... %zu more\n", gaps.size() - 12);
        failures += bad;
    }
    printf("%s\n", failures ? "VERIFY FAILED" : "VERIFY OK");
    return failures ? 1 : 0;
}
