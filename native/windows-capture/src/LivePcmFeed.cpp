#include "LivePcmFeed.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <stdexcept>

namespace scrb {

namespace {

constexpr int64_t kLiveSampleNs = 62500;

void Put32(std::vector<uint8_t>& out, size_t offset, uint32_t value) {
    for (int i = 0; i < 4; ++i) out[offset + i] = static_cast<uint8_t>(value >> (i * 8));
}

void Put64(std::vector<uint8_t>& out, size_t offset, uint64_t value) {
    for (int i = 0; i < 8; ++i) out[offset + i] = static_cast<uint8_t>(value >> (i * 8));
}

}  // namespace

LivePcmConverter::LivePcmConverter(FrameFn emit) : emit_(std::move(emit)) {}

void LivePcmConverter::Reset(State& state, uint32_t generation, uint32_t rate, int64_t startNs) {
    state.active = true;
    state.generation = generation;
    state.inputRate = rate;
    state.inputSamples = 0;
    state.outputSamples = 0;
    state.pendingSamples = 0;
    state.history.fill(0);
    state.historyPos = 0;
    const double cutoff = 0.45 * kLiveRate / rate;
    double total = 0;
    for (size_t i = 0; i < kFilterTaps; ++i) {
        const double x = static_cast<double>(i) - (kFilterTaps - 1) / 2.0;
        const double sinc = x == 0 ? 1 : std::sin(2 * 3.141592653589793 * cutoff * x) /
                                            (2 * 3.141592653589793 * cutoff * x);
        const double window = 0.54 - 0.46 * std::cos(2 * 3.141592653589793 * i /
                                                     (kFilterTaps - 1));
        state.coefficients[i] = 2 * cutoff * sinc * window;
        total += state.coefficients[i];
    }
    for (double& coefficient : state.coefficients) coefficient /= total;
    const int64_t delayNs = static_cast<int64_t>(((kFilterTaps - 1) / 2) *
                                                  static_cast<uint64_t>(kNsPerSec) / rate);
    state.nextNs = (std::max)(startNs + delayNs, state.lastEndNs);
    state.expectedInputNs = startNs;
}

bool LivePcmConverter::Pcm(uint8_t track, int64_t startNs, uint32_t inputRate,
                           uint32_t generation, const int16_t* samples, uint32_t count,
                           uint32_t skippedFrames) {
    if (track > 1 || startNs < 0 || inputRate < kLiveRate || !samples || !count) return false;
    State& state = states_[track];
    const int64_t tolerance = kNsPerSec / inputRate + kNsPerMs;
    const bool gap = state.active &&
        (state.generation != generation || state.inputRate != inputRate || skippedFrames ||
         std::llabs(startNs - state.expectedInputNs) > tolerance);
    if (!state.active || gap) {
        state.sequence += skippedFrames + (gap && !skippedFrames ? 1 : 0);
        Reset(state, generation, inputRate, startNs);
    }
    const bool ok = EmitPcm(track, state, samples, count);
    state.expectedInputNs = startNs +
        static_cast<int64_t>((static_cast<uint64_t>(count) * kNsPerSec) / inputRate);
    return ok;
}

bool LivePcmConverter::EmitPcm(uint8_t track, State& state, const int16_t* samples,
                               uint32_t count) {
    for (uint32_t i = 0; i < count; ++i)
        if (!PushSample(track, state, samples[i])) return false;
    return true;
}

bool LivePcmConverter::PushSample(uint8_t track, State& state, int16_t sample) {
    state.historyPos = (state.historyPos + 1) % kFilterTaps;
    state.history[state.historyPos] = sample;
    ++state.inputSamples;
    while ((state.outputSamples * state.inputRate) / kLiveRate < state.inputSamples) {
        double filtered = 0;
        for (size_t i = 0; i < kFilterTaps; ++i) {
            const size_t at = (state.historyPos + kFilterTaps - i) % kFilterTaps;
            filtered += state.coefficients[i] * state.history[at];
        }
        state.pending[state.pendingSamples++] = static_cast<int16_t>(std::clamp(
            std::lround(filtered), static_cast<long>(INT16_MIN), static_cast<long>(INT16_MAX)));
        ++state.outputSamples;
        if (state.pendingSamples == kLiveMaxSamples && !EmitPending(track, state)) return false;
    }
    return true;
}

bool LivePcmConverter::Flush(uint8_t track, State& state) {
    for (size_t i = 0; i < (kFilterTaps - 1) / 2; ++i)
        if (!PushSample(track, state, 0)) return false;
    return EmitPending(track, state);
}

bool LivePcmConverter::EmitPending(uint8_t track, State& state) {
    if (!state.pendingSamples) return true;
    LiveWireFrame frame;
    frame.track = track;
    frame.sequence = state.sequence++;
    frame.generation = state.generation;
    frame.startNs = state.nextNs;
    frame.samples.assign(state.pending.begin(), state.pending.begin() + state.pendingSamples);
    if (!emit_(frame)) return false;
    state.nextNs += static_cast<int64_t>(state.pendingSamples) * kLiveSampleNs;
    state.lastEndNs = state.nextNs;
    state.pendingSamples = 0;
    return true;
}

bool LivePcmConverter::Boundary(uint8_t track, int64_t atNs, uint32_t generation,
                                uint32_t skippedFrames) {
    if (track > 1 || atNs < 0) return false;
    State& state = states_[track];
    state.sequence += skippedFrames;
    if (skippedFrames) {
        state.pendingSamples = 0;
        state.active = false;
    } else if (state.active && !Flush(track, state)) {
        return false;
    }
    LiveWireFrame frame;
    frame.track = track;
    frame.boundary = true;
    frame.sequence = state.sequence++;
    frame.generation = generation;
    frame.startNs = state.active ? state.lastEndNs : (std::max)(atNs, state.lastEndNs);
    const bool ok = emit_(frame);
    state.active = false;
    state.inputSamples = state.outputSamples = 0;
    state.pendingSamples = 0;
    state.expectedInputNs = 0;
    return ok;
}

LivePcmFeed::LivePcmFeed(std::wstring pipeName, size_t capacity)
    : capacity_(capacity), pipeName_(std::move(pipeName)) {
    if (!capacity_ || capacity_ > kMaxCapacity || pipeName_.empty())
        throw std::invalid_argument("Invalid live feed options");
    thread_ = std::thread([this] { Loop(); });
}

LivePcmFeed::LivePcmFeed(LivePcmConverter::FrameFn writer, size_t capacity)
    : capacity_(capacity), testWriter_(std::move(writer)) {
    if (!capacity_ || capacity_ > kMaxCapacity || !testWriter_)
        throw std::invalid_argument("Invalid live feed options");
    thread_ = std::thread([this] { Loop(); });
}

LivePcmFeed::~LivePcmFeed() {
    Stop();
    if (thread_.joinable()) thread_.join();
}

void LivePcmFeed::NoteDrop(uint8_t track, uint32_t rate, uint32_t count) noexcept {
    if (track > 1) return;
    const uint64_t output = rate ? (static_cast<uint64_t>(count) * kLiveRate + rate - 1) / rate : 0;
    const uint32_t frames = static_cast<uint32_t>((std::max<uint64_t>)(1, (output + kLiveMaxSamples - 1) /
                                                                            kLiveMaxSamples));
    dropped_[track].fetch_add(frames);
    stats_.refused++;
}

bool LivePcmFeed::Enqueue(Entry&& entry) noexcept {
    if (closing_ || disabled_) return false;
    std::unique_lock<std::mutex> lock(mutex_, std::try_to_lock);
    if (!lock.owns_lock() || size_ == capacity_) return false;
    entry.skippedFrames = dropped_[entry.track].exchange(0);
    ring_[tail_] = std::move(entry);
    tail_ = (tail_ + 1) % capacity_;
    ++size_;
    lock.unlock();
    cv_.notify_one();
    return true;
}

bool LivePcmFeed::Offer(uint8_t track, int64_t startNs, uint32_t inputRate,
                        uint32_t generation, const int16_t* samples, uint32_t count) noexcept {
    stats_.offered++;
    if (track > 1 || startNs < 0 || !inputRate || !samples || !count || count > kMaxInputSamples) {
        NoteDrop(track, inputRate, count);
        return false;
    }
    Entry entry;
    entry.track = track;
    entry.startNs = startNs;
    entry.rate = inputRate;
    entry.generation = generation;
    entry.count = count;
    std::memcpy(entry.samples.data(), samples, count * sizeof(int16_t));
    if (Enqueue(std::move(entry))) return true;
    NoteDrop(track, inputRate, count);
    return false;
}

bool LivePcmFeed::Boundary(uint8_t track, int64_t atNs, uint32_t generation) noexcept {
    if (track > 1 || atNs < 0) return false;
    Entry entry;
    entry.boundary = true;
    entry.track = track;
    entry.startNs = atNs;
    entry.generation = generation;
    if (Enqueue(std::move(entry))) return true;
    NoteDrop(track, kLiveRate, 0);
    return false;
}

void LivePcmFeed::Stop() noexcept {
    if (closing_.exchange(true)) return;
    cv_.notify_all();
}

void LivePcmFeed::Loop() {
    LivePcmConverter converter([this](const LiveWireFrame& frame) { return WriteFrame(frame); });
    for (;;) {
        Entry entry;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait_for(lock, std::chrono::milliseconds(10), [this] { return closing_ || size_; });
            if (closing_ && !size_) break;
            if (!size_) continue;
            entry = std::move(ring_[head_]);
            head_ = (head_ + 1) % capacity_;
            --size_;
        }
        const bool ok = entry.boundary
            ? converter.Boundary(entry.track, entry.startNs, entry.generation, entry.skippedFrames)
            : converter.Pcm(entry.track, entry.startNs, entry.rate, entry.generation,
                            entry.samples.data(), entry.count, entry.skippedFrames);
        stats_.processed++;
        if (!ok) {
            disabled_ = true;
            if (!closing_) stats_.disconnects++;
            break;
        }
    }
    HANDLE pipe = pipe_.exchange(INVALID_HANDLE_VALUE);
    if (pipe != INVALID_HANDLE_VALUE) CloseHandle(pipe);
}

bool LivePcmFeed::WriteFrame(const LiveWireFrame& frame) {
    if (testWriter_) {
        const bool ok = testWriter_(frame);
        if (ok) stats_.emitted++;
        return ok;
    }
    if (!OpenPipe()) return false;
    std::vector<uint8_t> bytes(32 + frame.samples.size() * sizeof(int16_t));
    bytes[0] = 'S'; bytes[1] = 'L'; bytes[2] = 'P'; bytes[3] = '1';
    bytes[4] = 1;
    bytes[5] = frame.track;
    bytes[6] = frame.boundary ? 1 : 0;
    Put32(bytes, 8, frame.sequence);
    Put32(bytes, 12, frame.generation);
    Put64(bytes, 16, static_cast<uint64_t>(frame.startNs));
    Put32(bytes, 24, kLiveRate);
    Put32(bytes, 28, static_cast<uint32_t>(frame.samples.size()));
    for (size_t i = 0; i < frame.samples.size(); ++i) {
        const uint16_t sample = static_cast<uint16_t>(frame.samples[i]);
        bytes[32 + i * 2] = static_cast<uint8_t>(sample);
        bytes[33 + i * 2] = static_cast<uint8_t>(sample >> 8);
    }
    if (!WriteBytes(bytes.data(), static_cast<DWORD>(bytes.size()))) return false;
    stats_.emitted++;
    return true;
}

bool LivePcmFeed::OpenPipe() {
    for (;;) {
        HANDLE current = pipe_.load();
        if (current != INVALID_HANDLE_VALUE) return true;
        HANDLE opened = CreateFileW(pipeName_.c_str(), GENERIC_WRITE, 0, nullptr, OPEN_EXISTING,
                                    FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OVERLAPPED, nullptr);
        if (opened != INVALID_HANDLE_VALUE) {
            pipe_ = opened;
            return true;
        }
        const DWORD error = GetLastError();
        if (closing_) return false;
        if (error != ERROR_FILE_NOT_FOUND && error != ERROR_PIPE_BUSY) return false;
        Sleep(10);
    }
    return false;
}

bool LivePcmFeed::WriteBytes(const uint8_t* data, DWORD size) {
    HANDLE pipe = pipe_.load();
    DWORD offset = 0;
    while (offset < size) {
        OVERLAPPED overlap{};
        overlap.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        if (!overlap.hEvent) return false;
        DWORD wrote = 0;
        BOOL ok = WriteFile(pipe, data + offset, size - offset, &wrote, &overlap);
        if (!ok && GetLastError() == ERROR_IO_PENDING) {
            int closingWaits = 0;
            while (WaitForSingleObject(overlap.hEvent, 10) == WAIT_TIMEOUT) {
                if (closing_ && ++closingWaits >= 5) {
                    CancelIoEx(pipe, &overlap);
                    WaitForSingleObject(overlap.hEvent, INFINITE);
                    break;
                }
            }
            ok = GetOverlappedResult(pipe, &overlap, &wrote, FALSE);
        }
        const DWORD error = ok ? ERROR_SUCCESS : GetLastError();
        CloseHandle(overlap.hEvent);
        if (!ok || !wrote) {
            if (error == ERROR_OPERATION_ABORTED && closing_) return false;
            if (error == ERROR_BROKEN_PIPE || error == ERROR_PIPE_NOT_CONNECTED ||
                error == ERROR_NO_DATA || error == ERROR_INVALID_HANDLE)
                return false;
            return false;
        }
        offset += wrote;
    }
    return offset == size;
}

}  // namespace scrb
