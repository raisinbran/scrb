// Types shared by the capture thread, the track pipeline and the chunk store.
#pragma once
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <functional>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

namespace scrb {

constexpr uint32_t kRate = 48000;
constexpr int64_t kNsPerSec = 1000000000;
constexpr int64_t kNsPerMs = 1000000;

inline int64_t FramesToNs(int64_t frames) { return frames * kNsPerSec / kRate; }
inline double NsToMs(int64_t ns) { return ns / static_cast<double>(kNsPerMs); }

// Timestamps are absolute QPC-derived nanoseconds until the pipeline rebases
// them on the session origin.
struct Packet {
    int64_t stampNs = 0;    // first frame, from IAudioCaptureClient::GetBuffer
    int64_t arrivalNs = 0;  // QPC when the packet was read
    uint32_t generation = 0;  // the gate opening this packet passed
    uint32_t frames = 0;
    bool flagDiscontinuity = false;
    bool silentFlag = false;
    std::vector<int16_t> pcm;
};

// One gate for both tracks, checked on the capture threads ahead of the queue
// and the encoder.  See docs/plans/pause-resume.md, "The gate".
class Gate {
public:
    static constexpr int64_t kOpen = (std::numeric_limits<int64_t>::max)();
    int64_t Close(int64_t nowNs) {
        // Only an open gate moves: Stop during a pause must keep the pause's cutoff.
        int64_t open = kOpen;
        cutoffNs_.compare_exchange_strong(open, nowNs);
        return nowNs;
    }
    int64_t Open(int64_t nowNs) {
        resumeAfterNs_ = nowNs;
        ++generation_;
        cutoffNs_ = kOpen;
        return nowNs;
    }
    bool IsOpen() const { return cutoffNs_ == kOpen; }
    uint32_t Generation() const { return generation_; }
    // Whole packets only: one must start after the resume and end by the cutoff.
    bool Passes(int64_t stampNs, int64_t durationNs) const {
        return stampNs >= resumeAfterNs_ && stampNs + durationNs <= cutoffNs_;
    }

private:
    std::atomic<int64_t> resumeAfterNs_{0};
    std::atomic<int64_t> cutoffNs_{0};
    std::atomic<uint32_t> generation_{0};
};

struct DeviceInfo {
    std::string id;
    std::string name;
    std::string transport;  // internal, usb, bluetooth-handsfree, loopback, other
};

struct PaddedSpan {
    double offsetMs = 0;
    double lengthMs = 0;
    std::string cause;  // device-silent, possibly-missing
};

struct ChunkMeta {
    std::string chunkId;
    std::string track;
    uint64_t seq = 0;
    int64_t startNs = 0;
    int64_t deviceStampNs = 0;  // raw stream stamp, before any D2 correction
    int64_t wallAnchorTimelineNs = 0;
    std::string wallAnchorUtc;
    uint32_t rate = kRate;
    uint64_t frames = 0;
    std::vector<PaddedSpan> paddedSpans;
    DeviceInfo device;
    std::string source;
    std::string openReason;
    std::string closeReason;
    bool allZero = true;
    double missingBeforeMs = 0;  // span between the previous chunk's end and this start
    std::string missingCause;
    double overlapMs = 0;
};

class JsonObject {
public:
    JsonObject& Str(const char* key, const std::string& value) {
        Key(key);
        out_ << "\"" << Escape(value) << "\"";
        return *this;
    }
    JsonObject& Int(const char* key, int64_t value) {
        Key(key);
        out_ << value;
        return *this;
    }
    JsonObject& Num(const char* key, double value) {
        Key(key);
        out_.precision(3);
        out_ << std::fixed << value;
        return *this;
    }
    JsonObject& Bool(const char* key, bool value) {
        Key(key);
        out_ << (value ? "true" : "false");
        return *this;
    }
    JsonObject& Raw(const char* key, const std::string& json) {
        Key(key);
        out_ << json;
        return *this;
    }
    std::string Done() const { return "{" + out_.str() + "}"; }

    static std::string Escape(const std::string& s) {
        std::string r;
        for (unsigned char c : s) {
            if (c == '"' || c == '\\') {
                r += '\\';
                r += static_cast<char>(c);
            } else if (c < 0x20) {
                char buf[8];
                snprintf(buf, sizeof buf, "\\u%04x", c);
                r += buf;
            } else {
                r += static_cast<char>(c);
            }
        }
        return r;
    }

private:
    void Key(const char* key) {
        if (!first_) out_ << ",";
        first_ = false;
        out_ << "\"" << key << "\":";
    }
    std::ostringstream out_;
    bool first_ = true;
};

std::string ChunkMetaToJson(const ChunkMeta& m);

class ChunkSink {
public:
    virtual ~ChunkSink() = default;
    virtual bool Begin(const ChunkMeta& meta) = 0;
    virtual bool Write(const int16_t* pcm, uint32_t frames) = 0;
    virtual bool End(const ChunkMeta& meta) = 0;
    // A chunk's start moved after Begin, so its stored facts must follow.
    virtual void StartMoved(const ChunkMeta&) {}
    // The first free sequence number, so a restarted worker never reuses a name.
    virtual uint64_t FirstSeq() const { return 0; }
};

using EventFn = std::function<void(const std::string& name, const JsonObject& fields)>;

}  // namespace scrb
