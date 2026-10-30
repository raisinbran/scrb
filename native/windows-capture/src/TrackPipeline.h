// Chunk and detection rules for one track, free of WASAPI so they can be
// replayed from synthetic or logged packets.  Runs on the track's writer
// thread only, except the atomics in Stats.
#pragma once
#include <atomic>
#include <utility>
#include "Common.h"

namespace scrb {

struct PipelineConfig {
    std::string sessionId;
    std::string track;  // microphone or meeting
    std::string source;
    bool arrivalCheck = false;  // D2: only loopback stamps can hide lost time (F3)
    int64_t chunkTargetFrames = 5 * kRate;
    int64_t gapToleranceNs = 2 * kNsPerMs;         // D1
    int64_t stallNs = 500 * kNsPerMs;              // D3
    int64_t divergenceNs = 50 * kNsPerMs;          // D2
    int64_t divergenceConfirmNs = 250 * kNsPerMs;  // D2: must outlast a stall's drain burst
    int64_t divergenceStableNs = 20 * kNsPerMs;    // D2
    int64_t outputSwitchWindowNs = 3 * kNsPerSec;  // D2b
    int64_t minZeroRunNs = 100 * kNsPerMs;         // D2b
    double rateTolerance = 0.05;                   // D5
    std::function<void(int64_t* timelineNow, std::string* wallUtc, int64_t* wallNs)> readClocks;
};

struct Stats {
    std::atomic<uint64_t> packets{0};
    std::atomic<uint64_t> chunks{0};
    std::atomic<uint64_t> missingMs{0};
    std::atomic<uint64_t> writeErrors{0};
    std::atomic<int> levelCentiDb{-12000};
};

class TrackPipeline {
public:
    TrackPipeline(PipelineConfig config, ChunkSink& sink, EventFn emit);

    void Start(int64_t originNs);
    void OnPacket(const Packet& p);
    int64_t Pause();                // returns the track's end, timeline ns
    int64_t Resume(int64_t nowNs);  // returns the time resume took effect
    int64_t Stop();
    void OnSleep();
    void OnWake(int64_t nowNs);
    void OnStreamLost(const std::string& closeReason, const std::string& cause);
    void OnStreamOpened(const DeviceInfo& device, const std::string& openReason);
    void OnPermissionChanged();
    void OnSourceChanged(const std::string& source);
    void NoteOutputChange(int64_t nowNs);

    const Stats& stats() const { return stats_; }

private:
    void CloseChunk(const std::string& reason);
    void OpenChunk(int64_t startNs, int64_t rawStamp, int64_t arrivalNs);
    void TrackZeros(const Packet& p, int64_t offsetFrames);
    void FinishZeroRun();
    void ReportWriteError();
    bool CheckDivergence(const Packet& p);
    void CheckRate(const Packet& p, int64_t stamp);
    void ResetStreamState();

    PipelineConfig cfg_;
    ChunkSink& sink_;
    EventFn emit_;
    Stats stats_;

    bool started_ = false;
    bool paused_ = false;
    bool stopped_ = false;
    bool sleeping_ = false;
    int64_t wakeNs_ = 0;
    int64_t originNs_ = 0;
    int64_t resumeAfterNs_ = 0;

    bool chunkOpen_ = false;
    ChunkMeta chunk_;
    int64_t chunkFirstArrivalNs_ = 0;
    uint64_t nextSeq_ = 1;
    DeviceInfo device_;
    std::string pendingOpenReason_ = "start";
    std::string pendingCause_;
    bool endKnown_ = false;
    int64_t lastEndNs_ = 0;  // end of the last frame written, timeline ns
    bool anchorKnown_ = false;
    int64_t lastWallMinusTimeline_ = 0;

    bool havePrev_ = false;
    int64_t prevStampNs_ = 0;  // corrected, timeline ns
    uint32_t prevFrames_ = 0;
    int64_t prevArrivalNs_ = 0;

    int baselineCount_ = 0;
    int64_t baselineNs_ = 0;
    int64_t correctionNs_ = 0;
    bool candidate_ = false;
    int64_t candidateStartNs_ = 0;
    int64_t candidateDevNs_ = 0;

    bool rateWindowOpen_ = false;
    int64_t rateWindowStartNs_ = 0;
    uint64_t rateWindowFrames_ = 0;

    bool zeroRunOpen_ = false;
    int64_t zeroRunStartFrame_ = 0;
    int64_t zeroRunFrames_ = 0;
    std::vector<std::pair<int64_t, int64_t>> zeroRuns_;
    int64_t lastOutputChangeNs_ = -1;
};

}  // namespace scrb
