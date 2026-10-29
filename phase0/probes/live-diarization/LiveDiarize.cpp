// Phase 0 throwaway probe: simulated live speaker diarization with sherpa-onnx.
//
// offline mode: diarize the whole file once (the final-pass baseline).
// live mode:    every <hop> seconds, diarize the last <window> seconds, embed each
//               local cluster, and match it to persistent global speakers by
//               cosine similarity.  Only the newest <hop> seconds are emitted, so
//               labels are never revised after they are shown.
//
// Usage: LiveDiarize <wav> <out.txt> <seg.onnx> <embed.onnx> offline <cluster_threshold>
//        LiveDiarize <wav> <out.txt> <seg.onnx> <embed.onnx> live <window_s> <hop_s>
//                    <cluster_threshold> <match_threshold>
//        LiveDiarize <wav> <out.txt> <seg.onnx> <embed.onnx> inc <window_s> <hop_s>
//                    <cluster_threshold> <join_similarity>
//          (per-segment embeddings, online centroid clustering with merges;
//           also writes <out.txt>.final.txt with post-merge labels)
// Output lines: "<start> <end> <speaker>"; a JSON stats line goes to stdout.

#include <sherpa-onnx/c-api/c-api.h>

#define NOMINMAX
#include <Windows.h>
#include <psapi.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

namespace {

struct Segment {
    float start, end;
    int speaker;
};

double NowSeconds() {
    LARGE_INTEGER f, c;
    QueryPerformanceFrequency(&f);
    QueryPerformanceCounter(&c);
    return static_cast<double>(c.QuadPart) / f.QuadPart;
}

std::vector<Segment> Diarize(const SherpaOnnxOfflineSpeakerDiarization* sd,
                             const float* samples, int32_t n, float offset) {
    std::vector<Segment> out;
    const SherpaOnnxOfflineSpeakerDiarizationResult* r =
        SherpaOnnxOfflineSpeakerDiarizationProcess(sd, samples, n);
    if (!r) return out;
    int32_t count = SherpaOnnxOfflineSpeakerDiarizationResultGetNumSegments(r);
    const SherpaOnnxOfflineSpeakerDiarizationSegment* s =
        SherpaOnnxOfflineSpeakerDiarizationResultSortByStartTime(r);
    for (int32_t i = 0; i < count; ++i)
        out.push_back({s[i].start + offset, s[i].end + offset, s[i].speaker});
    SherpaOnnxOfflineSpeakerDiarizationDestroySegment(s);
    SherpaOnnxOfflineSpeakerDiarizationDestroyResult(r);
    return out;
}

std::vector<float> Embed(const SherpaOnnxSpeakerEmbeddingExtractor* ex,
                         const std::vector<float>& audio, int rate) {
    const SherpaOnnxOnlineStream* stream = SherpaOnnxSpeakerEmbeddingExtractorCreateStream(ex);
    SherpaOnnxOnlineStreamAcceptWaveform(stream, rate, audio.data(),
                                         static_cast<int32_t>(audio.size()));
    SherpaOnnxOnlineStreamInputFinished(stream);
    std::vector<float> v;
    if (SherpaOnnxSpeakerEmbeddingExtractorIsReady(ex, stream)) {
        const float* e = SherpaOnnxSpeakerEmbeddingExtractorComputeEmbedding(ex, stream);
        int dim = SherpaOnnxSpeakerEmbeddingExtractorDim(ex);
        v.assign(e, e + dim);
        SherpaOnnxSpeakerEmbeddingExtractorDestroyEmbedding(e);
        double norm = 0;
        for (float x : v) norm += x * x;
        norm = std::sqrt(norm);
        if (norm > 0) for (float& x : v) x = static_cast<float>(x / norm);
    }
    SherpaOnnxDestroyOnlineStream(stream);
    return v;
}

float Cosine(const std::vector<float>& a, const std::vector<float>& b) {
    double dot = 0, na = 0, nb = 0;
    for (size_t i = 0; i < a.size(); ++i) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return static_cast<float>(dot / (std::sqrt(na * nb) + 1e-9));
}

struct GlobalSpeaker {
    std::vector<float> centroid;  // unnormalized sum of member embeddings
    double seconds = 0;
};

}  // namespace

int main(int argc, char** argv) {
    if (argc < 7) {
        fprintf(stderr, "see usage in source header\n");
        return 2;
    }
    const char* wavPath = argv[1];
    const char* outPath = argv[2];
    std::string mode = argv[5];
    bool live = mode == "live" || mode == "inc";
    float clusterThreshold = static_cast<float>(atof(live ? argv[8] : argv[6]));
    float windowSeconds = live ? static_cast<float>(atof(argv[6])) : 0;
    float hopSeconds = live ? static_cast<float>(atof(argv[7])) : 0;
    float matchThreshold = live ? static_cast<float>(atof(argv[9])) : 0;

    SherpaOnnxOfflineSpeakerDiarizationConfig config;
    memset(&config, 0, sizeof(config));
    config.segmentation.pyannote.model = argv[3];
    config.segmentation.num_threads = 4;
    config.segmentation.provider = "cpu";
    config.embedding.model = argv[4];
    config.embedding.num_threads = 4;
    config.embedding.provider = "cpu";
    // A threshold of 2 or more is taken as a known speaker count instead.
    config.clustering.num_clusters = clusterThreshold >= 2 ? static_cast<int32_t>(clusterThreshold) : -1;
    config.clustering.threshold = clusterThreshold;
    config.min_duration_on = 0.3f;
    config.min_duration_off = 0.5f;
    const SherpaOnnxOfflineSpeakerDiarization* sd =
        SherpaOnnxCreateOfflineSpeakerDiarization(&config);
    if (!sd) { fprintf(stderr, "diarizer config failed\n"); return 1; }

    const SherpaOnnxWave* wave = SherpaOnnxReadWave(wavPath);
    if (!wave) { fprintf(stderr, "cannot read %s\n", wavPath); return 1; }
    const int rate = wave->sample_rate;
    const double audioSeconds = static_cast<double>(wave->num_samples) / rate;

    std::vector<Segment> emitted;
    double started = NowSeconds();
    double maxHopSeconds = 0;
    int hops = 0;

    int relabels = 0;
    std::vector<Segment> finalLabels;
    if (mode == "embed") {
        // argv[6]: segment list "<start> <end> <label>"; writes one embedding per line
        // to <out.txt> as "<start> <end> <label> v1 v2 ..." (unit-normalized).
        SherpaOnnxSpeakerEmbeddingExtractorConfig ec = config.embedding;
        const SherpaOnnxSpeakerEmbeddingExtractor* ex =
            SherpaOnnxCreateSpeakerEmbeddingExtractor(&ec);
        FILE* in = fopen(argv[6], "r");
        FILE* out = fopen(outPath, "w");
        float a, b;
        char label[64];
        while (in && fscanf(in, "%f %f %63s", &a, &b, label) == 3) {
            int32_t ia = static_cast<int32_t>(a * rate);
            int32_t ib = std::min(static_cast<int32_t>(b * rate), wave->num_samples);
            if (ib - ia < rate) continue;  // under 1 s gives unreliable embeddings
            std::vector<float> audio(wave->samples + ia, wave->samples + ib);
            std::vector<float> e = Embed(ex, audio, rate);
            if (e.empty()) continue;
            fprintf(out, "%.3f %.3f %s", a, b, label);
            for (float x : e) fprintf(out, " %.6f", x);
            fprintf(out, "\n");
            ++hops;
        }
        if (in) fclose(in);
        fclose(out);
        SherpaOnnxDestroySpeakerEmbeddingExtractor(ex);
        printf("{\"mode\": \"embed\", \"embeddings\": %d}\n", hops);
        return 0;
    }
    if (!live) {
        emitted = Diarize(sd, wave->samples, wave->num_samples, 0);
    } else if (mode == "inc") {
        // Per-segment embeddings with online centroid clustering.  Each new segment
        // joins the most similar speaker at or above matchThreshold, else starts a
        // new one; after every hop, speakers whose centroids reach the threshold are
        // merged.  A merge of an already-shown speaker is a visible relabel.
        SherpaOnnxSpeakerEmbeddingExtractorConfig ec = config.embedding;
        const SherpaOnnxSpeakerEmbeddingExtractor* ex =
            SherpaOnnxCreateSpeakerEmbeddingExtractor(&ec);
        std::vector<GlobalSpeaker> speakers;
        std::vector<int> parent;  // union-find over speaker ids for merges
        auto root = [&](int s) { while (parent[s] != s) s = parent[s] = parent[parent[s]]; return s; };
        std::vector<Segment> assigned;  // live label at emit time, speaker id pre-merge
        for (double t = hopSeconds; t < audioSeconds + hopSeconds; t += hopSeconds) {
            double hopStart = NowSeconds();
            double end = std::min(t, audioSeconds);
            double begin = std::max(0.0, end - windowSeconds);
            int32_t first = static_cast<int32_t>(begin * rate);
            int32_t count = static_cast<int32_t>(end * rate) - first;
            std::vector<Segment> local = Diarize(sd, wave->samples + first, count,
                                                 static_cast<float>(begin));
            float commitStart = static_cast<float>(t - hopSeconds);
            for (auto& s : local) {
                float a = std::max(s.start, commitStart), b = std::min(s.end, static_cast<float>(end));
                if (b - a <= 0.05f) continue;
                // Embed at least 1.5 s around the segment for a usable embedding.
                double mid = (a + b) / 2, half = std::max(0.75, (b - a) / 2.0);
                int32_t ia = static_cast<int32_t>(std::max(0.0, mid - half) * rate);
                int32_t ib = std::min(static_cast<int32_t>((mid + half) * rate), wave->num_samples);
                std::vector<float> audio(wave->samples + ia, wave->samples + ib);
                std::vector<float> e = Embed(ex, audio, rate);
                if (e.empty()) continue;
                int best = -1;
                float bestSim = -2;
                for (size_t g = 0; g < speakers.size(); ++g) {
                    if (root(static_cast<int>(g)) != static_cast<int>(g)) continue;
                    float sim = Cosine(e, speakers[g].centroid);
                    if (sim > bestSim) { bestSim = sim; best = static_cast<int>(g); }
                }
                if (best < 0 || bestSim < matchThreshold) {
                    speakers.push_back({std::vector<float>(e.size(), 0.f), 0});
                    parent.push_back(static_cast<int>(speakers.size()) - 1);
                    best = static_cast<int>(speakers.size()) - 1;
                }
                double w = b - a;
                for (size_t i = 0; i < e.size(); ++i)
                    speakers[best].centroid[i] += static_cast<float>(e[i] * w);
                speakers[best].seconds += w;
                assigned.push_back({a, b, best});
                emitted.push_back({a, b, best});
            }
            // Merge speakers whose centroids converged.
            bool merged = true;
            while (merged) {
                merged = false;
                for (size_t i = 0; i < speakers.size() && !merged; ++i) {
                    if (root(static_cast<int>(i)) != static_cast<int>(i)) continue;
                    for (size_t j = i + 1; j < speakers.size() && !merged; ++j) {
                        if (root(static_cast<int>(j)) != static_cast<int>(j)) continue;
                        if (Cosine(speakers[i].centroid, speakers[j].centroid) < matchThreshold) continue;
                        size_t keep = speakers[i].seconds >= speakers[j].seconds ? i : j;
                        size_t gone = keep == i ? j : i;
                        for (size_t k = 0; k < speakers[keep].centroid.size(); ++k)
                            speakers[keep].centroid[k] += speakers[gone].centroid[k];
                        speakers[keep].seconds += speakers[gone].seconds;
                        parent[gone] = static_cast<int>(keep);
                        ++relabels;
                        merged = true;
                    }
                }
            }
            maxHopSeconds = std::max(maxHopSeconds, NowSeconds() - hopStart);
            ++hops;
        }
        for (auto& s : assigned) finalLabels.push_back({s.start, s.end, root(s.speaker)});
        int live_count = 0;
        for (size_t g = 0; g < speakers.size(); ++g) live_count += root(static_cast<int>(g)) == static_cast<int>(g);
        fprintf(stderr, "speakers created: %zu, after merges: %d, relabels: %d\n",
                speakers.size(), live_count, relabels);
        SherpaOnnxDestroySpeakerEmbeddingExtractor(ex);
    } else {
        SherpaOnnxSpeakerEmbeddingExtractorConfig ec = config.embedding;
        const SherpaOnnxSpeakerEmbeddingExtractor* ex =
            SherpaOnnxCreateSpeakerEmbeddingExtractor(&ec);
        std::vector<GlobalSpeaker> globals;
        for (double t = hopSeconds; t < audioSeconds + hopSeconds; t += hopSeconds) {
            double hopStart = NowSeconds();
            double end = std::min(t, audioSeconds);
            double begin = std::max(0.0, end - windowSeconds);
            int32_t first = static_cast<int32_t>(begin * rate);
            int32_t count = static_cast<int32_t>(end * rate) - first;
            std::vector<Segment> local = Diarize(sd, wave->samples + first, count,
                                                 static_cast<float>(begin));
            // One embedding per local cluster, from all its audio in the window.
            int maxLocal = -1;
            for (auto& s : local) maxLocal = std::max(maxLocal, s.speaker);
            std::vector<std::vector<float>> localEmbeds(maxLocal + 1);
            std::vector<double> localSeconds(maxLocal + 1, 0);
            for (int k = 0; k <= maxLocal; ++k) {
                std::vector<float> audio;
                for (auto& s : local) {
                    if (s.speaker != k) continue;
                    int32_t a = static_cast<int32_t>(s.start * rate);
                    int32_t b = std::min(static_cast<int32_t>(s.end * rate), wave->num_samples);
                    audio.insert(audio.end(), wave->samples + a, wave->samples + b);
                    localSeconds[k] += s.end - s.start;
                }
                if (audio.size() > static_cast<size_t>(rate) / 2)
                    localEmbeds[k] = Embed(ex, audio, rate);
            }
            // Greedy one-to-one matching, best similarity first.
            std::vector<int> mapping(maxLocal + 1, -1);
            std::vector<bool> globalTaken(globals.size(), false);
            struct Pair { float sim; int local, global; };
            std::vector<Pair> pairs;
            for (int k = 0; k <= maxLocal; ++k)
                for (size_t g = 0; g < globals.size(); ++g)
                    if (!localEmbeds[k].empty())
                        pairs.push_back({Cosine(localEmbeds[k], globals[g].centroid), k,
                                         static_cast<int>(g)});
            std::sort(pairs.begin(), pairs.end(),
                      [](const Pair& a, const Pair& b) { return a.sim > b.sim; });
            for (auto& p : pairs) {
                if (p.sim < matchThreshold) break;
                if (mapping[p.local] >= 0 || globalTaken[p.global]) continue;
                mapping[p.local] = p.global;
                globalTaken[p.global] = true;
            }
            for (int k = 0; k <= maxLocal; ++k) {
                if (mapping[k] >= 0 || localEmbeds[k].empty()) continue;
                // A confident new voice becomes a new speaker; a brief unmatched
                // one is assigned to its nearest existing speaker instead.
                if (localSeconds[k] >= 2.0 || globals.empty()) {
                    globals.push_back({std::vector<float>(localEmbeds[k].size(), 0.f), 0});
                    mapping[k] = static_cast<int>(globals.size()) - 1;
                } else {
                    float best = -2;
                    for (size_t g = 0; g < globals.size(); ++g) {
                        float sim = Cosine(localEmbeds[k], globals[g].centroid);
                        if (sim > best) { best = sim; mapping[k] = static_cast<int>(g); }
                    }
                }
            }
            for (int k = 0; k <= maxLocal; ++k) {
                if (mapping[k] < 0 || localEmbeds[k].empty()) continue;
                GlobalSpeaker& g = globals[mapping[k]];
                for (size_t i = 0; i < g.centroid.size(); ++i)
                    g.centroid[i] += static_cast<float>(localEmbeds[k][i] * localSeconds[k]);
                g.seconds += localSeconds[k];
            }
            // Emit only the newest hop, clipped.
            float commitStart = static_cast<float>(t - hopSeconds);
            float commitEnd = static_cast<float>(end);
            for (auto& s : local) {
                float a = std::max(s.start, commitStart), b = std::min(s.end, commitEnd);
                if (b - a <= 0.01f || s.speaker > maxLocal || mapping[s.speaker] < 0) continue;
                emitted.push_back({a, b, mapping[s.speaker]});
            }
            maxHopSeconds = std::max(maxHopSeconds, NowSeconds() - hopStart);
            ++hops;
        }
        fprintf(stderr, "global speakers: %zu\n", globals.size());
        SherpaOnnxDestroySpeakerEmbeddingExtractor(ex);
    }
    double elapsed = NowSeconds() - started;

    FILE* out = fopen(outPath, "w");
    for (auto& s : emitted) fprintf(out, "%.3f %.3f %d\n", s.start, s.end, s.speaker);
    fclose(out);
    if (!finalLabels.empty()) {
        // Same segments with labels after every later merge (what a relabel pass shows).
        FILE* f = fopen((std::string(outPath) + ".final.txt").c_str(), "w");
        for (auto& s : finalLabels) fprintf(f, "%.3f %.3f %d\n", s.start, s.end, s.speaker);
        fclose(f);
    }
    PROCESS_MEMORY_COUNTERS pmc{};
    pmc.cb = sizeof(pmc);
    typedef BOOL(WINAPI * GetPmi)(HANDLE, PPROCESS_MEMORY_COUNTERS, DWORD);
    auto getPmi = reinterpret_cast<GetPmi>(
        GetProcAddress(LoadLibraryW(L"psapi.dll"), "GetProcessMemoryInfo"));
    if (getPmi) getPmi(GetCurrentProcess(), &pmc, sizeof(pmc));
    printf("{\"mode\": \"%s\", \"audio_seconds\": %.3f, \"processing_seconds\": %.3f, "
           "\"rtf\": %.4f, \"hops\": %d, \"max_hop_seconds\": %.3f, \"segments\": %zu, "
           "\"relabels\": %d, \"peak_working_set_mib\": %.1f}\n",
           mode.c_str(), audioSeconds, elapsed, elapsed / audioSeconds, hops, maxHopSeconds,
           emitted.size(), relabels, pmc.PeakWorkingSetSize / 1048576.0);
    SherpaOnnxFreeWave(wave);
    SherpaOnnxDestroyOfflineSpeakerDiarization(sd);
    return 0;
}
