// Writes one track's chunks as Ogg Opus files plus its chunks.log.  A chunk is
// written to <seq>.opus.part and renamed only after a full flush, so a finished
// name is always a complete file.  Pages reach the OS once a second, so a killed
// process leaves at most a .part for recovery.  See docs/plans/crash-safe-chunks.md.
#pragma once
#include <condition_variable>
#include <cstdio>
#include <deque>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include "Common.h"

struct OpusEncoder;

namespace scrb {

class OggOpusFile {
public:
    ~OggOpusFile();
    bool Open(const std::wstring& path, const std::vector<std::string>& tags);
    bool Write(const int16_t* pcm, uint32_t frames);
    // Replaces the tags in place.  They must be the same length as those given to Open.
    bool Retag(const std::vector<std::string>& tags);
    // Ends with end trimming, so a decoder yields exactly the frames written.
    bool Close();

private:
    bool EncodeFrame(const int16_t* frame);
    bool FlushPage(bool last);
    bool WritePage(const std::vector<uint8_t>& body, const std::vector<uint8_t>& lacing,
                   uint8_t flags, uint64_t granule);

    void* file_ = nullptr;  // HANDLE
    OpusEncoder* encoder_ = nullptr;
    int preSkip_ = 0;
    int64_t tagsOffset_ = 0;
    uint32_t serial_ = 0;
    uint32_t pageSeq_ = 0;
    std::vector<int16_t> pending_;
    uint64_t inputFrames_ = 0;
    uint64_t encodedFrames_ = 0;
    std::vector<uint8_t> pageBody_;
    std::vector<uint8_t> pageLacing_;
    int pagePackets_ = 0;
    bool ok_ = true;
};

class ChunkStore : public ChunkSink {
public:
    explicit ChunkStore(const std::wstring& dir);  // dir must exist
    ~ChunkStore() override;
    bool Begin(const ChunkMeta& meta) override;
    bool Write(const int16_t* pcm, uint32_t frames) override;
    bool End(const ChunkMeta& meta) override;
    void StartMoved(const ChunkMeta& meta) override;
    uint64_t FirstSeq() const override { return firstSeq_; }

private:
    std::wstring dir_;
    uint64_t firstSeq_ = 0;
    std::wstring partPath_;
    std::wstring finalPath_;
    OggOpusFile file_;
    FILE* log_ = nullptr;
};

// audio/session.log.  Lines are forced to disk on their own thread, so the disk
// can never delay a command.
class SessionLog {
public:
    SessionLog(const std::wstring& path, EventFn emit);
    ~SessionLog();  // writes whatever is queued first
    void Record(const std::string& jsonObject);  // gains its seq here

private:
    void Loop();
    FILE* file_ = nullptr;
    EventFn emit_;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::deque<std::string> queue_;
    uint64_t seq_ = 0;
    bool stop_ = false;
    std::thread thread_;
};

std::wstring Widen(const std::string& utf8);
std::string Narrow(const std::wstring& wide);

}  // namespace scrb
