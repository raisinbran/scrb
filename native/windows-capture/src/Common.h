// Types shared by the capture thread, the track pipeline and the chunk store.
#pragma once
#include <cstdint>
#include <cstdio>
#include <functional>
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
    uint32_t frames = 0;
    bool flagDiscontinuity = false;
    bool silentFlag = false;
    std::vector<int16_t> pcm;
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
};

using EventFn = std::function<void(const std::string& name, const JsonObject& fields)>;

}  // namespace scrb
