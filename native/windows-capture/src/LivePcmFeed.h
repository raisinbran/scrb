// Bounded live-only PCM export. The capture pipeline only copies into the ring;
// conversion and pipe I/O run on the exporter thread.
#pragma once

#include <Windows.h>

#include <array>
#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "Common.h"

namespace scrb {

constexpr uint32_t kLiveRate = 16000;
constexpr uint32_t kLiveMaxSamples = 1600;

struct LiveWireFrame {
    uint8_t track = 0;
    bool boundary = false;
    uint32_t sequence = 0;
    uint32_t generation = 0;
    int64_t startNs = 0;
    std::vector<int16_t> samples;
};

// Converts one track at a time with a 15-input-sample FIR delay. Output
// timestamps advance only by emitted 16 kHz sample counts.
class LivePcmConverter {
public:
    using FrameFn = std::function<bool(const LiveWireFrame&)>;
    explicit LivePcmConverter(FrameFn emit);

    bool Pcm(uint8_t track, int64_t startNs, uint32_t inputRate, uint32_t generation,
             const int16_t* samples, uint32_t count, uint32_t skippedFrames = 0);
    bool Boundary(uint8_t track, int64_t atNs, uint32_t generation, uint32_t skippedFrames = 0);

private:
    static constexpr size_t kFilterTaps = 31;
    struct State {
        bool active = false;
        uint32_t generation = 0;
        uint32_t sequence = 0;
        uint32_t inputRate = 0;
        uint64_t inputSamples = 0;
        uint64_t outputSamples = 0;
        uint32_t pendingSamples = 0;
        std::array<int16_t, kLiveMaxSamples> pending{};
        std::array<int16_t, kFilterTaps> history{};
        std::array<double, kFilterTaps> coefficients{};
        size_t historyPos = 0;
        int64_t nextNs = 0;
        int64_t lastEndNs = 0;
        int64_t expectedInputNs = 0;
        int64_t inputAnchorNs = 0;
    };

    void Reset(State& state, uint32_t generation, uint32_t rate, int64_t startNs);
    bool EmitPcm(uint8_t track, State& state, const int16_t* samples, uint32_t count);
    bool EmitPending(uint8_t track, State& state);
    bool PushSample(uint8_t track, State& state, int16_t sample);
    bool Flush(uint8_t track, State& state);
    FrameFn emit_;
    State states_[2];
};

struct LiveFeedStats {
    std::atomic<uint64_t> offered{0};
    std::atomic<uint64_t> refused{0};
    std::atomic<uint64_t> processed{0};
    std::atomic<uint64_t> emitted{0};
    std::atomic<uint64_t> disconnects{0};
};

class LivePcmFeed final : public LivePcmSink {
public:
    explicit LivePcmFeed(std::wstring pipeName, size_t capacity = 32);
    explicit LivePcmFeed(LivePcmConverter::FrameFn writer, size_t capacity = 32);
    ~LivePcmFeed();

    bool Offer(uint8_t track, int64_t startNs, uint32_t inputRate, uint32_t generation,
               const int16_t* samples, uint32_t count) noexcept override;
    bool Boundary(uint8_t track, int64_t atNs, uint32_t generation) noexcept override;
    void Stop() noexcept;
    const LiveFeedStats& stats() const { return stats_; }

private:
    static constexpr size_t kMaxCapacity = 64;
    static constexpr size_t kMaxInputSamples = 4096;
    struct Entry {
        bool boundary = false;
        uint8_t track = 0;
        int64_t startNs = 0;
        uint32_t rate = 0;
        uint32_t generation = 0;
        uint32_t count = 0;
        uint32_t skippedFrames = 0;
        std::array<int16_t, kMaxInputSamples> samples{};
    };

    bool Enqueue(Entry&& entry) noexcept;
    void NoteDrop(uint8_t track, uint32_t rate, uint32_t count) noexcept;
    void Loop();
    bool WriteFrame(const LiveWireFrame& frame);
    bool OpenPipe();
    bool WriteBytes(const uint8_t* data, DWORD size);

    struct DeferredBoundary {
        std::atomic<bool> pending{false};
        std::atomic<int64_t> atNs{0};
        std::atomic<uint32_t> generation{0};
        std::atomic<uint32_t> skippedFrames{0};
    };

    const size_t capacity_;
    std::wstring pipeName_;
    LivePcmConverter::FrameFn testWriter_;
    std::array<Entry, kMaxCapacity> ring_{};
    size_t head_ = 0;
    size_t tail_ = 0;
    size_t size_ = 0;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::atomic<bool> closing_{false};
    std::atomic<bool> disabled_{false};
    std::atomic<HANDLE> pipe_{INVALID_HANDLE_VALUE};
    std::atomic<uint32_t> dropped_[2]{};
    DeferredBoundary deferred_[2];
    LiveFeedStats stats_;
    std::thread thread_;
};

}  // namespace scrb
