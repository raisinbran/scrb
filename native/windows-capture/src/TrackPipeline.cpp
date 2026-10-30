#include "TrackPipeline.h"

#include <algorithm>
#include <cmath>

namespace scrb {

std::string ChunkMetaToJson(const ChunkMeta& m) {
    std::string spans = "[";
    for (size_t i = 0; i < m.paddedSpans.size(); ++i) {
        const auto& s = m.paddedSpans[i];
        if (i) spans += ",";
        spans += JsonObject().Num("offsetMs", s.offsetMs).Num("lengthMs", s.lengthMs)
                     .Str("cause", s.cause).Done();
    }
    spans += "]";
    return JsonObject()
        .Str("chunkId", m.chunkId).Str("track", m.track).Int("seq", static_cast<int64_t>(m.seq))
        .Int("startNs", m.startNs)
        .Raw("deviceStamp", JsonObject().Int("ns", m.deviceStampNs).Str("clock", "qpc").Done())
        .Raw("wallAnchor", JsonObject().Int("timelineNs", m.wallAnchorTimelineNs)
                               .Str("utc", m.wallAnchorUtc).Done())
        .Int("rate", m.rate).Int("frames", static_cast<int64_t>(m.frames))
        .Raw("paddedSpans", spans)
        .Str("deviceId", m.device.id).Str("deviceName", m.device.name)
        .Str("transport", m.device.transport).Str("source", m.source)
        .Str("openReason", m.openReason).Str("closeReason", m.closeReason)
        .Bool("allZero", m.allZero).Num("missingBeforeMs", m.missingBeforeMs)
        .Str("missingCause", m.missingCause).Num("overlapMs", m.overlapMs)
        .Done();
}

TrackPipeline::TrackPipeline(PipelineConfig config, ChunkSink& sink, EventFn emit)
    : cfg_(std::move(config)), sink_(sink), emit_(std::move(emit)) {}

void TrackPipeline::Start(int64_t originNs) {
    originNs_ = originNs;
    resumeAfterNs_ = originNs;
    started_ = true;
}

void TrackPipeline::ResetStreamState() {
    havePrev_ = false;
    baselineCount_ = 0;
    correctionNs_ = 0;
    candidate_ = false;
    rateWindowOpen_ = false;
}

void TrackPipeline::ReportWriteError() {
    stats_.writeErrors++;
    emit_("writeError", JsonObject().Str("track", cfg_.track).Str("chunkId", chunk_.chunkId));
}

// Returns true when the open chunk must end here.  Updates correctionNs_ when
// lost time is confirmed.
bool TrackPipeline::CheckDivergence(const Packet& p) {
    if (!cfg_.arrivalCheck) return false;
    int64_t div = p.arrivalNs - (p.stampNs + correctionNs_);
    if (baselineCount_ < 20) {
        baselineNs_ = baselineCount_ ? std::min(baselineNs_, div) : div;
        ++baselineCount_;
        return false;
    }
    int64_t dev = div - baselineNs_;
    if (dev < -cfg_.divergenceNs) {  // stream latency fell, which loses no time
        baselineNs_ = div;
        candidate_ = false;
        return false;
    }
    if (dev <= cfg_.divergenceNs) {
        baselineNs_ += dev / 1024;  // follows the 1 ms/h wander seen in Phase 0
        candidate_ = false;
        return false;
    }
    if (!candidate_ || std::llabs(dev - candidateDevNs_) > cfg_.divergenceStableNs) {
        candidate_ = true;
        candidateStartNs_ = p.arrivalNs;
        candidateDevNs_ = dev;
        return false;
    }
    if (p.arrivalNs - candidateStartNs_ < cfg_.divergenceConfirmNs) return false;

    candidate_ = false;
    correctionNs_ += dev;
    emit_("discontinuity", JsonObject().Str("track", cfg_.track).Str("kind", "arrival")
                               .Num("missingMs", NsToMs(dev))
                               .Int("atNs", p.stampNs + correctionNs_ - originNs_));
    if (chunkOpen_ && chunkFirstArrivalNs_ >= candidateStartNs_) {
        // Every frame of this chunk is past the loss: shift it rather than split it.
        chunk_.startNs += dev;
        chunk_.missingBeforeMs += NsToMs(dev);
        if (chunk_.missingCause.empty()) chunk_.missingCause = "unknown";
        prevStampNs_ += dev;
        rateWindowOpen_ = false;
        stats_.missingMs += static_cast<uint64_t>(NsToMs(dev));
        return false;
    }
    return true;
}

// D5: conversion to 48 kHz hides device rate changes unless the stamps show them.
void TrackPipeline::CheckRate(const Packet& p, int64_t stamp) {
    if (!chunkOpen_) return;
    if (!rateWindowOpen_) {
        rateWindowOpen_ = true;
        rateWindowStartNs_ = stamp;
        rateWindowFrames_ = 0;
    } else if (stamp - rateWindowStartNs_ >= kNsPerSec) {
        double measured = rateWindowFrames_ * static_cast<double>(kNsPerSec) / (stamp - rateWindowStartNs_);
        rateWindowOpen_ = false;
        if (std::abs(measured / kRate - 1.0) > cfg_.rateTolerance) {
            emit_("rateChanged", JsonObject().Str("track", cfg_.track).Num("measuredHz", measured)
                                     .Int("atNs", stamp));
            CloseChunk("rate");
            pendingOpenReason_ = "rate";
        }
    }
    rateWindowFrames_ += p.frames;
}

void TrackPipeline::OnPacket(const Packet& p) {
    stats_.packets++;
    double sum = 0;
    for (int16_t s : p.pcm) sum += static_cast<double>(s) * s;
    double rms = p.pcm.empty() ? 0 : std::sqrt(sum / p.pcm.size());
    double db = rms > 0 ? 20 * std::log10(rms / 32768.0) : -120.0;
    stats_.levelCentiDb = static_cast<int>(std::max(db, -120.0) * 100);
    if (!started_ || stopped_ || paused_ || sleeping_ || p.stampNs < resumeAfterNs_) return;
    // After standby Windows delivers the slept span as a burst of stale silence (F11).
    if (p.stampNs < wakeNs_ && p.arrivalNs < wakeNs_ + kNsPerSec) return;

    bool lostTime = CheckDivergence(p);
    int64_t stamp = p.stampNs + correctionNs_ - originNs_;
    std::string reason, cause;
    if (lostTime) {
        reason = "discontinuity";
        cause = "unknown";
    } else if (chunkOpen_ && havePrev_) {
        int64_t delta = stamp - (prevStampNs_ + FramesToNs(prevFrames_));
        int64_t arrivalGap = p.arrivalNs - prevArrivalNs_;
        bool stalled = arrivalGap > cfg_.stallNs;
        if (stalled) lastStallArrivalNs_ = p.arrivalNs;
        // A jump inside the burst that drains a stall belongs to that stall.
        bool afterStall = lastStallArrivalNs_ && p.arrivalNs - lastStallArrivalNs_ < kNsPerSec;
        bool stampJump = std::llabs(delta) > cfg_.gapToleranceNs;
        if (stampJump || p.flagDiscontinuity) {
            reason = stalled ? "stall" : "discontinuity";
            cause = stalled || afterStall ? "stall" : "unknown";
            emit_("discontinuity", JsonObject().Str("track", cfg_.track)
                      .Str("kind", stampJump ? "stamp" : "flag")
                      .Num("missingMs", NsToMs(std::max<int64_t>(delta, 0)))
                      .Num("arrivalGapMs", NsToMs(arrivalGap)).Int("atNs", stamp));
        } else if (stalled) {
            reason = cause = "stall";
        } else if (static_cast<int64_t>(chunk_.frames) >= cfg_.chunkTargetFrames) {
            reason = "rollover";
        }
    }
    if (!reason.empty()) {
        CloseChunk(reason);
        pendingOpenReason_ = reason;
        if (!cause.empty()) pendingCause_ = cause;
    }
    CheckRate(p, stamp);

    if (!chunkOpen_) OpenChunk(stamp, p.stampNs, p.arrivalNs);
    if (std::any_of(p.pcm.begin(), p.pcm.end(), [](int16_t s) { return s != 0; }))
        chunk_.allZero = false;
    TrackZeros(p, static_cast<int64_t>(chunk_.frames));
    if (p.silentFlag) {
        double off = NsToMs(FramesToNs(chunk_.frames));
        double len = NsToMs(FramesToNs(p.frames));
        auto& spans = chunk_.paddedSpans;
        if (!spans.empty() && std::abs(spans.back().offsetMs + spans.back().lengthMs - off) < 0.5)
            spans.back().lengthMs += len;
        else
            spans.push_back({off, len, "device-silent"});
    }
    if (!sink_.Write(p.pcm.data(), p.frames)) ReportWriteError();
    chunk_.frames += p.frames;
    lastEndNs_ = stamp + FramesToNs(p.frames);
    endKnown_ = true;
    prevStampNs_ = stamp;
    prevFrames_ = p.frames;
    prevArrivalNs_ = p.arrivalNs;
    havePrev_ = true;
}

void TrackPipeline::TrackZeros(const Packet& p, int64_t offsetFrames) {
    for (uint32_t i = 0; i < p.frames; ++i) {
        if (p.pcm[i] == 0) {
            if (!zeroRunOpen_) {
                zeroRunOpen_ = true;
                zeroRunStartFrame_ = offsetFrames + i;
                zeroRunFrames_ = 0;
            }
            ++zeroRunFrames_;
        } else if (zeroRunOpen_) {
            FinishZeroRun();
        }
    }
}

void TrackPipeline::FinishZeroRun() {
    if (zeroRunOpen_ && FramesToNs(zeroRunFrames_) >= cfg_.minZeroRunNs)
        zeroRuns_.emplace_back(zeroRunStartFrame_, zeroRunFrames_);
    zeroRunOpen_ = false;
}

void TrackPipeline::CloseChunk(const std::string& reason) {
    if (!chunkOpen_) return;
    FinishZeroRun();
    if (cfg_.track == "meeting" && lastOutputChangeNs_ >= 0) {
        for (const auto& run : zeroRuns_) {
            int64_t begin = chunk_.startNs + FramesToNs(run.first);
            int64_t end = begin + FramesToNs(run.second);
            if (end >= lastOutputChangeNs_ - cfg_.outputSwitchWindowNs &&
                begin <= lastOutputChangeNs_ + cfg_.outputSwitchWindowNs) {
                chunk_.paddedSpans.push_back({NsToMs(FramesToNs(run.first)),
                                              NsToMs(FramesToNs(run.second)), "possibly-missing"});
            }
        }
    }
    zeroRuns_.clear();
    chunk_.closeReason = reason;
    if (!sink_.End(chunk_)) ReportWriteError();
    stats_.chunks++;
    chunkOpen_ = false;
    emit_("chunkClosed", JsonObject().Raw("chunk", ChunkMetaToJson(chunk_)).Str("track", cfg_.track)
                             .Int("atNs", lastEndNs_));
}

void TrackPipeline::OpenChunk(int64_t startNs, int64_t rawStamp, int64_t arrivalNs) {
    chunk_ = ChunkMeta{};
    chunkFirstArrivalNs_ = arrivalNs;
    rateWindowOpen_ = false;  // D5 windows never span a boundary's time jump
    chunk_.seq = nextSeq_++;
    char id[32];
    snprintf(id, sizeof id, "-%06llu", static_cast<unsigned long long>(chunk_.seq));
    chunk_.chunkId = cfg_.sessionId + "-" + cfg_.track + id;
    chunk_.track = cfg_.track;
    chunk_.startNs = startNs;
    chunk_.deviceStampNs = rawStamp;
    chunk_.device = device_;
    chunk_.source = cfg_.source;
    chunk_.openReason = pendingOpenReason_;
    if (cfg_.readClocks) {
        int64_t wallNs = 0;
        cfg_.readClocks(&chunk_.wallAnchorTimelineNs, &chunk_.wallAnchorUtc, &wallNs);
        int64_t offset = wallNs - chunk_.wallAnchorTimelineNs;
        if (anchorKnown_ && std::llabs(offset - lastWallMinusTimeline_) > kNsPerSec) {
            emit_("clockFault", JsonObject().Str("track", cfg_.track)
                      .Num("jumpMs", NsToMs(offset - lastWallMinusTimeline_)).Int("atNs", startNs));
        }
        lastWallMinusTimeline_ = offset;
        anchorKnown_ = true;
    }
    if (endKnown_) {
        int64_t gap = startNs - lastEndNs_;
        if (gap > cfg_.gapToleranceNs) {
            chunk_.missingBeforeMs = NsToMs(gap);
            chunk_.missingCause = pendingCause_.empty() ? "unknown" : pendingCause_;
            stats_.missingMs += static_cast<uint64_t>(chunk_.missingBeforeMs);
        } else if (gap < -cfg_.gapToleranceNs) {
            chunk_.overlapMs = NsToMs(-gap);
        }
    }
    pendingCause_.clear();
    pendingOpenReason_ = "rollover";
    if (!sink_.Begin(chunk_)) ReportWriteError();
    chunkOpen_ = true;
}

int64_t TrackPipeline::Pause() {
    CloseChunk("pause");
    paused_ = true;
    return endKnown_ ? lastEndNs_ : 0;
}

int64_t TrackPipeline::Resume(int64_t nowNs) {
    paused_ = false;
    resumeAfterNs_ = nowNs;
    pendingOpenReason_ = "resume";
    pendingCause_ = "pause";
    havePrev_ = false;
    return nowNs - originNs_;
}

int64_t TrackPipeline::Stop() {
    CloseChunk("stop");
    stopped_ = true;
    return endKnown_ ? lastEndNs_ : 0;
}

void TrackPipeline::OnSleep() {
    sleeping_ = true;
    if (paused_) return;
    CloseChunk("sleep");
    pendingOpenReason_ = "wake";
    pendingCause_ = "sleep";
    havePrev_ = false;
}

void TrackPipeline::OnWake(int64_t nowNs) {
    sleeping_ = false;
    wakeNs_ = nowNs;
    if (paused_) return;
    CloseChunk("wake");  // only a missed sleep notification leaves one open
    pendingOpenReason_ = "wake";
    pendingCause_ = "sleep";
    havePrev_ = false;
}

void TrackPipeline::OnStreamLost(const std::string& closeReason, const std::string& cause) {
    CloseChunk(closeReason);
    pendingOpenReason_ = closeReason;
    pendingCause_ = cause;
    ResetStreamState();
}

void TrackPipeline::OnStreamOpened(const DeviceInfo& device, const std::string& openReason) {
    CloseChunk(openReason);
    device_ = device;
    pendingOpenReason_ = openReason;
    if (pendingCause_.empty()) pendingCause_ = "device";
    ResetStreamState();
}

void TrackPipeline::OnPermissionChanged() {
    CloseChunk("permission");
    pendingOpenReason_ = "permission";
    pendingCause_ = "permission";
}

void TrackPipeline::OnSourceChanged(const std::string& source) {
    CloseChunk("source");
    pendingOpenReason_ = "source";
    pendingCause_ = "source";
    cfg_.source = source;
}

void TrackPipeline::NoteOutputChange(int64_t nowNs) { lastOutputChangeNs_ = nowNs - originNs_; }

}  // namespace scrb
