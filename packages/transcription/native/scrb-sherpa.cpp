// Speaker worker: sherpa-onnx diarization and embeddings behind a line protocol,
// in a process of its own so it can be killed at any moment.  The clustering
// that turns embeddings into speakers lives in TypeScript.
//
// Usage: scrb-sherpa <segmentation.onnx> <embedding.onnx> <threads>
//
// Requests on stdin, one reply line of JSON on stdout for each.  Exits on EOF,
// so it never outlives the process that started it.
//   diarize <threshold> <wav path>      {"segments":[[start,end,speaker],...]}
//                                       preceded by {"progress":0.5} lines
//   embed <wav path> <count>            then <count> lines "<start> <end>"
//                                       {"vectors":[[...]|null,...]}
//   window <numSamples>                 then numSamples f32le, 16 kHz mono
//                                       {"segments":[...]}, times relative to it
//   embedpcm <numSamples>               then numSamples f32le
//                                       {"vector":[...]|null}
//   Failures reply {"error":"..."}.

#include <sherpa-onnx/c-api/c-api.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

namespace {

constexpr int kRate = 16000;
constexpr float kWindowThreshold = 1.2f;

struct Worker {
    SherpaOnnxOfflineSpeakerDiarizationConfig config{};
    const SherpaOnnxOfflineSpeakerDiarization* sd = nullptr;
    const SherpaOnnxSpeakerEmbeddingExtractor* extractor = nullptr;
};

void Reply(const std::string& line) {
    fwrite(line.data(), 1, line.size(), stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

void ReplyError(const std::string& message) { Reply("{\"error\":\"" + message + "\"}"); }

void Configure(Worker& w, float threshold) {
    // A threshold of 2 or more is a known speaker count.
    w.config.clustering.num_clusters = threshold >= 2 ? static_cast<int32_t>(threshold) : -1;
    w.config.clustering.threshold = threshold;
    SherpaOnnxOfflineSpeakerDiarizationSetConfig(w.sd, &w.config);
}

int32_t Progress(int32_t done, int32_t total, void*) {
    char line[64];
    snprintf(line, sizeof(line), "{\"progress\":%.4f}", total > 0 ? float(done) / total : 0.f);
    Reply(line);
    return 0;
}

std::string Segments(Worker& w, const float* samples, int32_t n, bool progress) {
    const SherpaOnnxOfflineSpeakerDiarizationResult* r =
        progress ? SherpaOnnxOfflineSpeakerDiarizationProcessWithCallback(w.sd, samples, n, Progress, nullptr)
                 : SherpaOnnxOfflineSpeakerDiarizationProcess(w.sd, samples, n);
    if (!r) return "{\"error\":\"diarization failed\"}";
    int32_t count = SherpaOnnxOfflineSpeakerDiarizationResultGetNumSegments(r);
    const SherpaOnnxOfflineSpeakerDiarizationSegment* s =
        SherpaOnnxOfflineSpeakerDiarizationResultSortByStartTime(r);
    std::ostringstream out;
    out << "{\"segments\":[";
    char item[80];
    for (int32_t i = 0; i < count; ++i) {
        snprintf(item, sizeof(item), "%s[%.3f,%.3f,%d]", i ? "," : "", s[i].start, s[i].end, s[i].speaker);
        out << item;
    }
    out << "]}";
    SherpaOnnxOfflineSpeakerDiarizationDestroySegment(s);
    SherpaOnnxOfflineSpeakerDiarizationDestroyResult(r);
    return out.str();
}

std::string Embed(Worker& w, const float* samples, int32_t n) {
    const SherpaOnnxOnlineStream* stream = SherpaOnnxSpeakerEmbeddingExtractorCreateStream(w.extractor);
    SherpaOnnxOnlineStreamAcceptWaveform(stream, kRate, samples, n);
    SherpaOnnxOnlineStreamInputFinished(stream);
    std::string out = "null";
    if (SherpaOnnxSpeakerEmbeddingExtractorIsReady(w.extractor, stream)) {
        const float* e = SherpaOnnxSpeakerEmbeddingExtractorComputeEmbedding(w.extractor, stream);
        int dim = SherpaOnnxSpeakerEmbeddingExtractorDim(w.extractor);
        double norm = 0;
        for (int i = 0; i < dim; ++i) norm += e[i] * e[i];
        norm = std::sqrt(norm);
        if (norm > 0) {
            std::ostringstream v;
            v << '[';
            char item[32];
            for (int i = 0; i < dim; ++i) {
                snprintf(item, sizeof(item), "%s%.6f", i ? "," : "", e[i] / norm);
                v << item;
            }
            v << ']';
            out = v.str();
        }
        SherpaOnnxSpeakerEmbeddingExtractorDestroyEmbedding(e);
    }
    SherpaOnnxDestroyOnlineStream(stream);
    return out;
}

bool ReadPcm(int32_t n, std::vector<float>& pcm) {
    pcm.resize(n);
    return n > 0 && fread(pcm.data(), sizeof(float), n, stdin) == static_cast<size_t>(n);
}

bool ReadLine(std::string& line) {
    line.clear();
    int c;
    while ((c = fgetc(stdin)) != EOF) {
        if (c == '\n') return true;
        if (c != '\r') line.push_back(static_cast<char>(c));
    }
    return !line.empty();
}

void HandleDiarize(Worker& w, float threshold, const std::string& path) {
    const SherpaOnnxWave* wave = SherpaOnnxReadWave(path.c_str());
    if (!wave) return ReplyError("cannot read wav");
    Configure(w, threshold);
    Reply(Segments(w, wave->samples, wave->num_samples, true));
    SherpaOnnxFreeWave(wave);
}

void HandleEmbed(Worker& w, const std::string& path, int count) {
    const SherpaOnnxWave* wave = SherpaOnnxReadWave(path.c_str());
    std::ostringstream out;
    out << "{\"vectors\":[";
    std::string line;
    for (int i = 0; i < count; ++i) {
        ReadLine(line);
        float a = 0, b = 0;
        std::istringstream(line) >> a >> b;
        if (i) out << ',';
        int32_t ia = wave ? std::max(0, static_cast<int32_t>(a * wave->sample_rate)) : 0;
        int32_t ib = wave ? std::min(static_cast<int32_t>(b * wave->sample_rate), wave->num_samples) : 0;
        if (ib - ia < kRate) out << "null";  // under 1 s gives unreliable embeddings
        else out << Embed(w, wave->samples + ia, ib - ia);
    }
    out << "]}";
    if (wave) {
        SherpaOnnxFreeWave(wave);
        Reply(out.str());
    } else {
        ReplyError("cannot read wav");
    }
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 4) {
        fprintf(stderr, "usage: scrb-sherpa <segmentation.onnx> <embedding.onnx> <threads>\n");
        return 2;
    }
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
#endif
    const int threads = std::max(1, atoi(argv[3]));
    Worker w;
    memset(&w.config, 0, sizeof(w.config));
    w.config.segmentation.pyannote.model = argv[1];
    w.config.segmentation.num_threads = threads;
    w.config.segmentation.provider = "cpu";
    w.config.embedding.model = argv[2];
    w.config.embedding.num_threads = threads;
    w.config.embedding.provider = "cpu";
    w.config.clustering.num_clusters = -1;
    w.config.clustering.threshold = kWindowThreshold;
    w.config.min_duration_on = 0.3f;
    w.config.min_duration_off = 0.5f;
    w.sd = SherpaOnnxCreateOfflineSpeakerDiarization(&w.config);
    if (!w.sd) {
        fprintf(stderr, "diarizer config failed\n");
        return 1;
    }
    SherpaOnnxSpeakerEmbeddingExtractorConfig ec = w.config.embedding;
    w.extractor = SherpaOnnxCreateSpeakerEmbeddingExtractor(&ec);
    if (!w.extractor) {
        fprintf(stderr, "embedding model failed\n");
        return 1;
    }
    Reply("{\"ready\":true}");

    std::string line;
    std::vector<float> pcm;
    while (ReadLine(line)) {
        std::istringstream in(line);
        std::string cmd;
        in >> cmd;
        if (cmd == "diarize") {
            float threshold = 0;
            std::string path;
            in >> threshold >> std::ws;
            std::getline(in, path);
            HandleDiarize(w, threshold, path);
        } else if (cmd == "embed") {
            int count = 0;
            in >> count >> std::ws;
            std::string path;
            std::getline(in, path);
            HandleEmbed(w, path, count);
        } else if (cmd == "window") {
            int32_t n = 0;
            in >> n;
            if (!ReadPcm(n, pcm)) return 1;
            Configure(w, kWindowThreshold);
            Reply(Segments(w, pcm.data(), n, false));
        } else if (cmd == "embedpcm") {
            int32_t n = 0;
            in >> n;
            if (!ReadPcm(n, pcm)) return 1;
            Reply("{\"vector\":" + Embed(w, pcm.data(), n) + "}");
        } else {
            ReplyError("unknown command");
        }
    }
    SherpaOnnxDestroySpeakerEmbeddingExtractor(w.extractor);
    SherpaOnnxDestroyOfflineSpeakerDiarization(w.sd);
    return 0;
}
