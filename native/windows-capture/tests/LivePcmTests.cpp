#include <Windows.h>

#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "../src/LivePcmFeed.h"
#include "../src/TrackPipeline.h"

using namespace scrb;

namespace {

int failures = 0;
#define CHECK(c) do { if (!(c)) { printf("  FAIL line %d: %s\n", __LINE__, #c); ++failures; } } while (0)

bool WaitUntil(const std::function<bool()>& ready, DWORD timeoutMs = 2000) {
    const ULONGLONG end = GetTickCount64() + timeoutMs;
    while (!ready() && GetTickCount64() < end) Sleep(1);
    return ready();
}

std::vector<int16_t> SpeechPacket(uint32_t count, uint64_t offset, uint32_t rate) {
    std::vector<int16_t> pcm(count);
    for (uint32_t i = 0; i < count; ++i) {
        const double t = static_cast<double>(offset + i) / rate;
        pcm[i] = static_cast<int16_t>(9000 * std::sin(2 * 3.141592653589793 * 180 * t) +
                                      3000 * std::sin(2 * 3.141592653589793 * 420 * t));
    }
    return pcm;
}

void CheckContinuousRate(uint32_t rate) {
    std::vector<LiveWireFrame> frames;
    LivePcmConverter converter([&](const LiveWireFrame& frame) {
        frames.push_back(frame);
        return true;
    });
    const uint32_t packet = rate / 100;
    uint64_t input = 0;
    constexpr int64_t start = 1000000000;
    const int64_t delay = 15LL * kNsPerSec / rate;
    for (int i = 0; i < 6000; ++i) {
        auto pcm = SpeechPacket(packet, input, rate);
        const int64_t stamp = start + static_cast<int64_t>(input * kNsPerSec / rate);
        CHECK(converter.Pcm(0, stamp, rate, 0, pcm.data(), packet));
        input += packet;
    }
    CHECK(converter.Boundary(0, start + 60 * kNsPerSec, 0));

    uint64_t samples = 0;
    int64_t expected = start + delay;
    uint32_t sequence = 0;
    for (const auto& frame : frames) {
        CHECK(frame.sequence == sequence++);
        CHECK(frame.startNs == expected);
        CHECK(frame.generation == 0);
        if (!frame.boundary) {
            CHECK(!frame.samples.empty() && frame.samples.size() <= kLiveMaxSamples);
            samples += frame.samples.size();
            expected += static_cast<int64_t>(frame.samples.size()) * 62500;
        }
    }
    const uint64_t expectedSamples = (input + 15) * kLiveRate / rate +
        (((input + 15) * kLiveRate) % rate != 0);
    CHECK(samples == expectedSamples);
    CHECK(frames.back().boundary);
    CHECK(frames.back().startNs == start + delay + static_cast<int64_t>(samples) * 62500);
    printf("  %u Hz: %llu samples, %zu PCM frames, end %lld ns\n", rate,
           static_cast<unsigned long long>(samples), frames.size() - 1,
           static_cast<long long>(frames.back().startNs));
}

void TestContinuousRates() {
    puts("Live feed: 60 seconds stay contiguous at 48 and 44.1 kHz");
    CheckContinuousRate(48000);
    CheckContinuousRate(44100);
}

void TestSplitsAndGenerations() {
    puts("Live feed: frames split and tracks advance independently");
    std::vector<LiveWireFrame> frames;
    LivePcmConverter converter([&](const LiveWireFrame& frame) {
        frames.push_back(frame);
        return true;
    });
    std::vector<int16_t> pcm(2048, 100);
    CHECK(converter.Pcm(0, 0, 16000, 0, pcm.data(), static_cast<uint32_t>(pcm.size())));
    CHECK(converter.Boundary(0, 128 * kNsPerMs, 0));
    CHECK(converter.Pcm(1, 0, 16000, 0, pcm.data(), 1600));
    CHECK(converter.Pcm(0, 200 * kNsPerMs, 16000, 1, pcm.data(), 1600));
    CHECK(frames[0].samples.size() == 1600);
    CHECK(frames[1].samples.size() == 463);
    CHECK(frames[1].startNs == 100 * kNsPerMs + 937500);
    CHECK(frames[2].boundary && frames[2].startNs == 129875000);
    CHECK(frames[3].track == 1 && frames[3].generation == 0);
    CHECK(frames[4].track == 0 && frames[4].generation == 1);
}

double ConvertedRms(double frequency) {
    std::vector<int16_t> output;
    LivePcmConverter converter([&](const LiveWireFrame& frame) {
        if (!frame.boundary) output.insert(output.end(), frame.samples.begin(), frame.samples.end());
        return true;
    });
    std::vector<int16_t> input(48000);
    for (size_t i = 0; i < input.size(); ++i)
        input[i] = static_cast<int16_t>(12000 * std::sin(2 * 3.141592653589793 * frequency * i / 48000));
    converter.Pcm(0, 0, 48000, 0, input.data(), static_cast<uint32_t>(input.size()));
    converter.Boundary(0, kNsPerSec, 0);
    double sum = 0;
    for (size_t i = 100; i + 100 < output.size(); ++i)
        sum += static_cast<double>(output[i]) * output[i];
    return std::sqrt(sum / (output.size() - 200));
}

void TestResamplerRejectsAliasing() {
    puts("Live feed: resampler attenuates out-of-band input");
    const double pass = ConvertedRms(1000);
    const double stop = ConvertedRms(12000);
    CHECK(stop < pass * 0.1);
    printf("  RMS 1 kHz %.1f, 12 kHz %.1f, ratio %.4f\n", pass, stop, stop / pass);
}

void TestTimestampJitterDoesNotDropSpeech() {
    puts("Live feed: accepted timestamp jitter keeps samples contiguous");
    for (const auto& stamps : {
             std::array<int64_t, 3>{0, 11500000, 20000000},
             std::array<int64_t, 3>{0, 26000000, 4000000},
         }) {
        std::vector<LiveWireFrame> frames;
        LivePcmConverter converter([&](const LiveWireFrame& frame) {
            frames.push_back(frame);
            return true;
        });
        std::vector<int16_t> pcm(480, 100);
        for (int64_t stamp : stamps)
            CHECK(converter.Pcm(0, stamp, 48000, 0, pcm.data(), static_cast<uint32_t>(pcm.size())));
        CHECK(converter.Boundary(0, 30 * kNsPerMs, 0));
        CHECK(frames.size() == 2);
        if (frames.size() == 2) {
            CHECK(frames[0].samples.size() == 485);
            CHECK(frames[0].sequence == 0);
            CHECK(frames[0].startNs == 312500);
            CHECK(frames[1].boundary && frames[1].sequence == 1);
            CHECK(frames[1].startNs == frames[0].startNs + 485 * 62500);
        }
    }
}

void TestDropBeforeBoundaryStaysVisible() {
    puts("Live feed: a dropped tail cannot compress its boundary");
    std::vector<LiveWireFrame> frames;
    LivePcmConverter converter([&](const LiveWireFrame& frame) {
        frames.push_back(frame);
        return true;
    });
    std::vector<int16_t> full(1600, 100);
    std::vector<int16_t> tail(80, 100);
    converter.Pcm(0, 0, 16000, 0, full.data(), static_cast<uint32_t>(full.size()));
    converter.Pcm(0, 100 * kNsPerMs, 16000, 0, tail.data(), static_cast<uint32_t>(tail.size()));
    converter.Boundary(0, 200 * kNsPerMs, 0, 2);
    CHECK(frames.size() == 2);
    CHECK(frames[1].boundary && frames[1].sequence == 3);
    CHECK(frames[1].startNs == 200 * kNsPerMs);
}

struct MemorySink : ChunkSink {
    uint64_t written = 0;
    bool Begin(const ChunkMeta&) override { return true; }
    bool Write(const int16_t*, uint32_t count) override { written += count; return true; }
    bool End(const ChunkMeta&) override { return true; }
};

struct GenerationSink : LivePcmSink {
    struct Seen { uint8_t track; uint32_t generation; bool boundary; int64_t atNs; };
    std::vector<Seen> seen;
    bool Offer(uint8_t track, int64_t startNs, uint32_t, uint32_t generation,
               const int16_t*, uint32_t) noexcept override {
        seen.push_back({track, generation, false, startNs});
        return true;
    }
    bool Boundary(uint8_t track, int64_t atNs, uint32_t generation) noexcept override {
        seen.push_back({track, generation, true, atNs});
        return true;
    }
};

void TestPipelineGenerationsStayIndependent() {
    puts("Live feed: pipeline boundaries advance only their track");
    GenerationSink live;
    MemorySink micStore;
    MemorySink meetingStore;
    PipelineConfig micConfig;
    micConfig.sessionId = "test";
    micConfig.track = "microphone";
    micConfig.live = &live;
    PipelineConfig meetingConfig = micConfig;
    meetingConfig.track = "meeting";
    meetingConfig.liveTrack = 1;
    TrackPipeline mic(micConfig, micStore, [](const std::string&, const JsonObject&) {});
    TrackPipeline meeting(meetingConfig, meetingStore, [](const std::string&, const JsonObject&) {});
    mic.OnStreamOpened({"mic", "mic", "internal"}, "start");
    meeting.OnStreamOpened({"meeting", "meeting", "loopback"}, "start");
    mic.Start(0, 1);
    meeting.Start(0, 1);
    Packet packet;
    packet.frames = 480;
    packet.generation = 1;
    packet.pcm.assign(packet.frames, 100);
    mic.OnPacket(packet);
    meeting.OnPacket(packet);
    mic.OnGateClosed();
    mic.OnGateOpened();
    packet.generation = 2;
    packet.stampNs = 2 * kNsPerSec;
    packet.arrivalNs = packet.stampNs;
    mic.OnPacket(packet);
    Packet meetingPacket = packet;
    meetingPacket.generation = 1;
    meetingPacket.stampNs = 10 * kNsPerMs;
    meetingPacket.arrivalNs = meetingPacket.stampNs;
    meeting.OnPacket(meetingPacket);
    mic.OnSourceChanged("new");
    mic.OnGateClosed();
    mic.OnGateClosed();
    mic.OnGateOpened();
    mic.OnPermissionChanged();
    mic.OnSleep();
    mic.OnWake(3 * kNsPerSec);
    mic.OnStreamLost("device", "device");
    mic.OnStreamOpened({"new", "new", "usb"}, "device");
    packet.generation = 3;
    packet.stampNs = 4 * kNsPerSec;
    packet.arrivalNs = packet.stampNs;
    mic.OnPacket(packet);
    mic.Stop();
    const size_t stoppedAt = live.seen.size();
    packet.stampNs = 5 * kNsPerSec;
    packet.arrivalNs = packet.stampNs;
    mic.OnPacket(packet);

    CHECK(live.seen.size() == 14 && stoppedAt == live.seen.size());
    CHECK(live.seen[0].track == 0 && live.seen[0].generation == 0 && !live.seen[0].boundary && live.seen[0].atNs == 0);
    CHECK(live.seen[1].track == 1 && live.seen[1].generation == 0 && !live.seen[1].boundary && live.seen[1].atNs == 0);
    CHECK(live.seen[2].track == 0 && live.seen[2].generation == 0 && live.seen[2].boundary && live.seen[2].atNs == 10 * kNsPerMs);
    CHECK(live.seen[3].track == 0 && live.seen[3].generation == 1 && !live.seen[3].boundary && live.seen[3].atNs == 2 * kNsPerSec);
    CHECK(live.seen[4].track == 1 && live.seen[4].generation == 0 && !live.seen[4].boundary && live.seen[4].atNs == 10 * kNsPerMs);
    CHECK(live.seen[5].track == 0 && live.seen[5].generation == 1 && live.seen[5].boundary && live.seen[5].atNs == 2010 * kNsPerMs);
    for (size_t i = 6; i <= 11; ++i) {
        CHECK(live.seen[i].track == 0 && live.seen[i].boundary);
        CHECK(live.seen[i].generation == i - 4);
        CHECK(live.seen[i].atNs == 2010 * kNsPerMs);
    }
    CHECK(live.seen[12].track == 0 && live.seen[12].generation == 8 && !live.seen[12].boundary && live.seen[12].atNs == 4 * kNsPerSec);
    CHECK(live.seen[13].track == 0 && live.seen[13].generation == 8 && live.seen[13].boundary && live.seen[13].atNs == 4010 * kNsPerMs);
    for (size_t i = 3; i < live.seen.size(); ++i)
        if (live.seen[i].track == 0) CHECK(live.seen[i].atNs >= live.seen[i - 1].atNs);
}

void TestStallKeepsDurableCapture() {
    puts("Live feed: stalled consumer never delays durable writes or Stop");
    HANDLE entered = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HANDLE release = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    {
        LivePcmFeed feed([&](const LiveWireFrame&) {
            SetEvent(entered);
            WaitForSingleObject(release, INFINITE);
            return true;
        }, 2);
        std::vector<int16_t> fullFrame(1600, 100);
        CHECK(feed.Offer(0, 0, 16000, 0, fullFrame.data(), static_cast<uint32_t>(fullFrame.size())));
        CHECK(WaitForSingleObject(entered, 1000) == WAIT_OBJECT_0);
        MemorySink sink;
        PipelineConfig config;
        config.sessionId = "test";
        config.track = "microphone";
        config.live = &feed;
        TrackPipeline pipeline(config, sink, [](const std::string&, const JsonObject&) {});
        pipeline.OnStreamOpened({"id", "name", "internal"}, "start");
        pipeline.Start(0, 1);
        Packet packet;
        packet.frames = 480;
        packet.generation = 1;
        packet.pcm.assign(packet.frames, 100);
        for (int i = 0; i < 1000; ++i) {
            packet.stampNs = static_cast<int64_t>(i) * 10 * kNsPerMs;
            packet.arrivalNs = packet.stampNs;
            pipeline.OnPacket(packet);
        }
        const auto before = std::chrono::steady_clock::now();
        pipeline.Stop();
        feed.Stop();
        const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - before).count();
        CHECK(elapsed < 100);
        CHECK(sink.written == 1000ULL * packet.frames);
        CHECK(feed.stats().refused.load() > 0);
        printf("  Stop %lld ms, durable samples %llu, refused live entries %llu\n",
               static_cast<long long>(elapsed), static_cast<unsigned long long>(sink.written),
               static_cast<unsigned long long>(feed.stats().refused.load()));
        SetEvent(release);
    }
    CloseHandle(release);
    CloseHandle(entered);
}

void TestBoundarySurvivesFullRing() {
    puts("Live feed: full ring retains a pause boundary");
    HANDLE entered = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HANDLE release = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    std::vector<LiveWireFrame> frames;
    {
        LivePcmFeed feed([&](const LiveWireFrame& frame) {
            if (frames.empty()) {
                SetEvent(entered);
                WaitForSingleObject(release, INFINITE);
            }
            frames.push_back(frame);
            return true;
        }, 2);
        std::vector<int16_t> pcm(1600, 100);
        CHECK(feed.Offer(0, 0, 16000, 0, pcm.data(), static_cast<uint32_t>(pcm.size())));
        CHECK(WaitForSingleObject(entered, 1000) == WAIT_OBJECT_0);
        CHECK(feed.Offer(0, 100 * kNsPerMs, 16000, 0, pcm.data(), static_cast<uint32_t>(pcm.size())));
        CHECK(feed.Offer(0, 200 * kNsPerMs, 16000, 0, pcm.data(), static_cast<uint32_t>(pcm.size())));
        CHECK(feed.Boundary(0, 300 * kNsPerMs, 0));
        CHECK(!feed.Offer(0, 400 * kNsPerMs, 16000, 1, pcm.data(), static_cast<uint32_t>(pcm.size())));
        const auto start = std::chrono::steady_clock::now();
        feed.Stop();
        CHECK(std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - start).count() < 100);
        SetEvent(release);
    }
    CHECK(frames.size() == 5);
    if (frames.size() == 5) {
        CHECK(frames.back().boundary);
        CHECK(frames.back().sequence == 4);
        CHECK(frames.back().generation == 0);
        CHECK(frames.back().startNs >= 300 * kNsPerMs);
    }
    CloseHandle(release);
    CloseHandle(entered);
}

void TestThrowingWriterPreservesCapture() {
    puts("Live feed: exporter exceptions do not terminate durable capture");
    LivePcmFeed feed([](const LiveWireFrame&) -> bool {
        throw std::runtime_error("injected exporter failure");
    }, 2);
    std::vector<int16_t> pcm(1600, 100);
    CHECK(feed.Offer(0, 0, 16000, 0, pcm.data(), static_cast<uint32_t>(pcm.size())));
    CHECK(WaitUntil([&] { return feed.stats().disconnects.load() == 1; }));
    MemorySink store;
    PipelineConfig config;
    config.sessionId = "test";
    config.track = "microphone";
    config.live = &feed;
    TrackPipeline pipeline(config, store, [](const std::string&, const JsonObject&) {});
    pipeline.OnStreamOpened({"mic", "mic", "internal"}, "start");
    pipeline.Start(0, 1);
    Packet packet;
    packet.frames = 480;
    packet.generation = 1;
    packet.pcm.assign(packet.frames, 100);
    pipeline.OnPacket(packet);
    pipeline.Stop();
    CHECK(store.written == packet.frames);
    CHECK(feed.stats().disconnects.load() == 1);
}

void TestBrokenPipeDisablesFeed() {
    puts("Live feed: broken pipe disables only live output");
    const std::wstring name = L"\\\\.\\pipe\\scrb-live-test-" + std::to_wstring(GetCurrentProcessId());
    HANDLE server = CreateNamedPipeW(name.c_str(), PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE | PIPE_READMODE_BYTE |
                                     PIPE_WAIT, 1, 4096, 4096, 0, nullptr);
    CHECK(server != INVALID_HANDLE_VALUE);
    std::thread closer([server] {
        ConnectNamedPipe(server, nullptr);
        CloseHandle(server);
    });
    {
        LivePcmFeed feed(name, 4);
        std::vector<int16_t> pcm(1600, 100);
        CHECK(feed.Offer(0, 0, 16000, 0, pcm.data(), static_cast<uint32_t>(pcm.size())));
        for (int i = 1; i < 100 && !feed.stats().disconnects.load(); ++i) {
            feed.Offer(0, i * 100 * kNsPerMs, 16000, 0, pcm.data(), static_cast<uint32_t>(pcm.size()));
            Sleep(2);
        }
        CHECK(WaitUntil([&] { return feed.stats().disconnects.load() == 1; }));
    }
    closer.join();
}

void TestStopFlushesHealthyPipe() {
    puts("Live feed: Stop flushes tail and boundary without waiting");
    const std::wstring name = L"\\\\.\\pipe\\scrb-live-stop-" + std::to_wstring(GetCurrentProcessId());
    HANDLE server = CreateNamedPipeW(name.c_str(), PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE | PIPE_READMODE_BYTE |
                                     PIPE_WAIT, 1, 4096, 4096, 0, nullptr);
    std::vector<uint8_t> bytes;
    std::thread reader([&] {
        ConnectNamedPipe(server, nullptr);
        uint8_t block[4096];
        DWORD count = 0;
        while (ReadFile(server, block, sizeof block, &count, nullptr) && count)
            bytes.insert(bytes.end(), block, block + count);
        CloseHandle(server);
    });
    const auto before = std::chrono::steady_clock::now();
    {
        LivePcmFeed feed(name, 4);
        std::vector<int16_t> pcm(80, 100);
        CHECK(feed.Offer(0, 0, 16000, 0, pcm.data(), static_cast<uint32_t>(pcm.size())));
        CHECK(feed.Boundary(0, 5 * kNsPerMs, 0));
        feed.Stop();
    }
    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - before).count();
    reader.join();
    CHECK(elapsed < 100);
    CHECK(bytes.size() == 32 + 95 * 2 + 32);
    CHECK(bytes[6] == 0 && bytes[28] == 95);
    CHECK(bytes[32 + 95 * 2 + 6] == 1);
    printf("  healthy Stop and drain %lld ms\n", static_cast<long long>(elapsed));
}

void TestStopCancelsStalledPipe() {
    puts("Live feed: Stop cancels a stalled overlapped write safely");
    const std::wstring name = L"\\\\.\\pipe\\scrb-live-stall-" + std::to_wstring(GetCurrentProcessId());
    HANDLE server = CreateNamedPipeW(name.c_str(), PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE | PIPE_READMODE_BYTE |
                                     PIPE_WAIT, 1, 512, 512, 0, nullptr);
    HANDLE connected = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HANDLE release = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    std::thread stalled([&] {
        ConnectNamedPipe(server, nullptr);
        SetEvent(connected);
        WaitForSingleObject(release, INFINITE);
        CloseHandle(server);
    });
    const auto before = std::chrono::steady_clock::now();
    {
        LivePcmFeed feed(name, 4);
        std::vector<int16_t> pcm(1600, 100);
        for (int i = 0; i < 20; ++i)
            feed.Offer(0, i * 100 * kNsPerMs, 16000, 0, pcm.data(),
                       static_cast<uint32_t>(pcm.size()));
        CHECK(WaitForSingleObject(connected, 1000) == WAIT_OBJECT_0);
        const auto stopStart = std::chrono::steady_clock::now();
        feed.Stop();
        const auto stopElapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - stopStart).count();
        CHECK(stopElapsed < 50);
        printf("  stalled Stop returned in %lld ms\n", static_cast<long long>(stopElapsed));
    }
    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - before).count();
    CHECK(elapsed < 250);
    printf("  stalled exporter cleanup %lld ms\n", static_cast<long long>(elapsed));
    SetEvent(release);
    stalled.join();
    CloseHandle(release);
    CloseHandle(connected);
}

void Write32(std::ofstream& out, uint32_t value) {
    out.write(reinterpret_cast<const char*>(&value), sizeof value);
}

void Write64(std::ofstream& out, uint64_t value) {
    out.write(reinterpret_cast<const char*>(&value), sizeof value);
}

bool WriteFrame(std::ofstream& out, const LiveWireFrame& frame) {
    out.write("SLP1", 4);
    const uint8_t fields[4] = {1, frame.track, static_cast<uint8_t>(frame.boundary), 0};
    out.write(reinterpret_cast<const char*>(fields), sizeof fields);
    Write32(out, frame.sequence);
    Write32(out, frame.generation);
    Write64(out, static_cast<uint64_t>(frame.startNs));
    Write32(out, kLiveRate);
    Write32(out, static_cast<uint32_t>(frame.samples.size()));
    out.write(reinterpret_cast<const char*>(frame.samples.data()),
              static_cast<std::streamsize>(frame.samples.size() * sizeof(int16_t)));
    return out.good();
}

int WriteSixtySeconds(uint32_t rate, const char* path) {
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    const uint32_t packet = rate / 100;
    uint64_t input = 0;
    bool accepted = true;
    {
        LivePcmFeed feed([&](const LiveWireFrame& frame) { return WriteFrame(out, frame); }, 64);
        for (int i = 0; i < 6000; ++i) {
            auto pcm = SpeechPacket(packet, input, rate);
            if (!feed.Offer(0, static_cast<int64_t>(input * kNsPerSec / rate), rate, 0,
                            pcm.data(), packet))
                return 1;
            input += packet;
            while (feed.stats().processed.load() < static_cast<uint64_t>(i + 1)) Sleep(0);
            Sleep(0);
        }
        accepted &= feed.Boundary(0, 60 * kNsPerSec, 0);
        feed.Stop();
        accepted &= feed.stats().refused.load() == 0;
    }
    return accepted && out.good() ? 0 : 1;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc == 4 && std::string(argv[1]) == "--write-60")
        return WriteSixtySeconds(static_cast<uint32_t>(std::stoul(argv[2])), argv[3]);
    TestContinuousRates();
    TestSplitsAndGenerations();
    TestTimestampJitterDoesNotDropSpeech();
    TestPipelineGenerationsStayIndependent();
    TestResamplerRejectsAliasing();
    TestDropBeforeBoundaryStaysVisible();
    TestStallKeepsDurableCapture();
    TestBoundarySurvivesFullRing();
    TestThrowingWriterPreservesCapture();
    TestBrokenPipeDisablesFeed();
    TestStopFlushesHealthyPipe();
    TestStopCancelsStalledPipe();
    printf("%s: %d failure(s)\n", failures ? "FAIL" : "PASS", failures);
    return failures ? 1 : 0;
}
