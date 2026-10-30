// Replays synthetic and logged packets through TrackPipeline (contract section 6).
// Usage: PipelineTests.exe [path to phase0 sleep-wake-timing.csv]
#include <cmath>
#include <cstdio>
#include <fstream>

#include "../src/TrackPipeline.h"

using namespace scrb;

namespace {

int g_failures = 0;
#define CHECK(c) do { if (!(c)) { printf("  FAIL line %d: %s\n", __LINE__, #c); ++g_failures; } } while (0)

struct MemorySink : ChunkSink {
    std::vector<ChunkMeta> closed;
    uint64_t written = 0;
    bool Begin(const ChunkMeta&) override { return true; }
    bool Write(const int16_t*, uint32_t f) override { written += f; return true; }
    bool End(const ChunkMeta& m) override { closed.push_back(m); return true; }
};

PipelineConfig MakeConfig(const char* track, bool arrival) {
    PipelineConfig c;
    c.sessionId = "s";
    c.track = track;
    c.arrivalCheck = arrival;
    return c;
}

struct Rig {
    MemorySink sink;
    int discontinuities = 0;
    TrackPipeline pipe;
    int64_t t = 1000 * kNsPerSec;
    int64_t stamp = 1000 * kNsPerSec;
    explicit Rig(const char* track, bool arrival = false)
        : pipe(MakeConfig(track, arrival), sink, [this](const std::string& n, const JsonObject&) {
              discontinuities += n == "discontinuity";
          }) {
        pipe.OnStreamOpened({"id", "name", "internal"}, "start");
        pipe.Start(t);
    }
    void Feed(int packets, int16_t value = 100, bool flag = false, bool silent = false, int64_t stepNs = 10 * kNsPerMs) {
        for (int i = 0; i < packets; ++i) {
            Packet p;
            p.frames = 480;
            p.stampNs = stamp;
            p.arrivalNs = t + 10 * kNsPerMs;
            p.flagDiscontinuity = flag && i == 0;
            p.silentFlag = silent;
            p.pcm.assign(480, value);
            pipe.OnPacket(p);
            stamp += 10 * kNsPerMs;
            t += stepNs;
        }
    }
};

void TestRolloverAndGaps() {
    puts("T14 rollover and seq; T2 stamp gap; flag split; 2 ms tolerance");
    Rig r("microphone");
    r.Feed(600);
    r.stamp += 16 * kNsPerMs;
    r.Feed(100);
    r.stamp += 1 * kNsPerMs;
    r.Feed(10);
    r.Feed(10, 100, true);
    r.pipe.Stop();
    auto& c = r.sink.closed;
    CHECK(c.size() == 4);
    CHECK(c[0].closeReason == "rollover" && c[0].frames == 5 * kRate);
    CHECK(c[1].closeReason == "discontinuity" && c[1].seq == 2);
    CHECK(c[2].missingBeforeMs > 15 && c[2].missingBeforeMs < 17);
    CHECK(c[3].missingBeforeMs == 0);
    CHECK(r.sink.written == 720 * 480);
}

void TestHandsFreeJitter() {
    puts("Hands-free stamp jitter does not split; a larger jump does");
    Rig r("microphone");
    r.pipe.OnStreamOpened({"id", "name", "bluetooth-handsfree"}, "device");
    for (int i = 0; i < 50; ++i) {
        r.stamp += i % 2 ? -6 * kNsPerMs : 6 * kNsPerMs;
        r.Feed(1);
    }
    r.stamp += 30 * kNsPerMs;
    r.Feed(10);
    r.pipe.Stop();
    CHECK(r.discontinuities == 1);
    CHECK(r.sink.closed.size() == 2);
}

void TestStandbyLoss() {
    puts("T3 loopback time loss with clean stamps is re-anchored");
    Rig r("meeting", true);
    r.Feed(300);
    r.t += 1690 * kNsPerMs;
    r.Feed(100);
    r.pipe.Stop();
    CHECK(r.discontinuities == 1);
    CHECK(r.sink.closed.size() == 2);
    CHECK(r.sink.closed[1].missingBeforeMs > 1600 && r.sink.closed[1].missingBeforeMs < 1700);
}

void TestWake() {
    puts("T11 sleep and wake: offset shifts the fresh chunk, no extra split");
    Rig r("meeting", true);
    r.Feed(300);
    r.pipe.OnSleep();
    r.t += 44 * kNsPerSec;
    r.stamp += 44 * kNsPerSec;
    r.pipe.OnWake(r.t);
    r.Feed(100);
    r.pipe.Stop();
    auto& c = r.sink.closed;
    CHECK(c.size() == 2);
    CHECK(c[0].closeReason == "sleep" && c[1].openReason == "wake" && c[1].missingCause == "sleep");
    CHECK(std::abs(c[1].missingBeforeMs - 44000) < 5);
}

void TestDrainBurst() {
    puts("T4 process stall: buffered loopback drains, nothing corrected, audio kept");
    Rig r("meeting", true);
    r.Feed(300);
    r.t += 13 * kNsPerSec;
    r.Feed(1300, 5, false, false, 20 * 1000);
    r.t = r.stamp;
    r.Feed(100);
    r.pipe.Stop();
    double lost = 0;
    for (const auto& c : r.sink.closed) lost += c.missingBeforeMs;
    CHECK(r.discontinuities == 0);
    CHECK(lost == 0);
    CHECK(r.sink.written == 1700 * 480);
    CHECK(r.sink.closed[0].closeReason == "stall");
}

void TestPauseAndLoss() {
    puts("T13 pause spans; T6 stream loss span and new device");
    Rig r("microphone");
    r.Feed(100);
    CHECK(r.pipe.Pause() == kNsPerSec);
    r.Feed(200);
    CHECK(r.pipe.Resume(r.t) == 3 * kNsPerSec);
    r.Feed(100);
    r.pipe.OnStreamLost("device", "device");
    r.t += 7 * kNsPerSec;
    r.stamp += 7 * kNsPerSec;
    r.pipe.OnStreamOpened({"id2", "other", "usb"}, "device");
    r.Feed(100);
    r.pipe.Stop();
    auto& c = r.sink.closed;
    CHECK(c.size() == 3);
    CHECK(c[1].openReason == "resume" && c[1].missingCause == "pause");
    CHECK(std::abs(c[1].missingBeforeMs - 2000) < 1);
    CHECK(c[2].device.id == "id2" && c[2].missingCause == "device");
    CHECK(std::abs(c[2].missingBeforeMs - 7000) < 1);
}

void TestMarks() {
    puts("T3b zeros near an output change; device-silent span; no split");
    Rig r("meeting");
    r.Feed(100);
    r.Feed(140, 0);
    r.pipe.NoteOutputChange(r.t);
    r.Feed(10, 0, false, true);
    r.Feed(100);
    r.pipe.Stop();
    CHECK(r.sink.closed.size() == 1);
    bool marked = false, silent = false;
    for (const auto& s : r.sink.closed[0].paddedSpans) {
        marked |= s.cause == "possibly-missing";
        silent |= s.cause == "device-silent";
    }
    CHECK(marked && silent);
    CHECK(!r.sink.closed[0].allZero);
}

void TestRealStandbyLog(const char* path) {
    printf("F11 replay of the logged standby run: %s\n", path);
    std::ifstream in(path);
    if (!in) { puts("  SKIP: file not found"); return; }
    MemorySink sink;
    TrackPipeline pipe(MakeConfig("meeting", true), sink, [](const std::string&, const JsonObject&) {});
    std::string line;
    std::getline(in, line);
    struct Row { double qpc, arrival, frames; };
    std::vector<Row> rows;
    while (std::getline(in, line)) {
        Row r;
        if (sscanf_s(line.c_str(), "app,%lf,%lf,%lf", &r.qpc, &r.arrival, &r.frames) == 3) rows.push_back(r);
    }
    pipe.OnStreamOpened({"id", "n", "loopback"}, "start");
    pipe.Start(static_cast<int64_t>(rows[0].qpc * kNsPerSec));
    for (size_t i = 0; i + 1 < rows.size(); ++i) {
        Packet p;
        p.stampNs = static_cast<int64_t>(rows[i].qpc * kNsPerSec);
        p.arrivalNs = static_cast<int64_t>(rows[i].arrival * kNsPerSec);
        p.frames = static_cast<uint32_t>(rows[i + 1].frames - rows[i].frames);
        p.pcm.assign(p.frames, 1);
        pipe.OnPacket(p);
    }
    pipe.Stop();
    double lost = 0;
    for (const auto& c : sink.closed) lost += c.missingBeforeMs;
    double raw = (rows.back().qpc - rows[0].qpc - (rows.back().frames - rows[0].frames) / kRate) * 1000;
    printf("  raw offset %.0f ms, detected missing %.0f ms\n", raw, lost);
    CHECK(raw > 1500);
    CHECK(std::abs(lost - raw) < 100);
}

}  // namespace

int main(int argc, char** argv) {
    TestRolloverAndGaps();
    TestHandsFreeJitter();
    TestStandbyLoss();
    TestWake();
    TestDrainBurst();
    TestPauseAndLoss();
    TestMarks();
    if (argc > 1) TestRealStandbyLog(argv[1]);
    printf("%s (%d failures)\n", g_failures ? "FAILED" : "PASSED", g_failures);
    return g_failures ? 1 : 0;
}
