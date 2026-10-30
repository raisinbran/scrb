// Writes one track's chunks as Ogg Opus files plus its index.jsonl.  A chunk
// is written to <seq>.opus.tmp and renamed only after a full flush, so a
// finished name is always a complete file.  Pages reach the OS once a second,
// so a killed process leaves at most the open chunk unfinished on disk.
#pragma once
#include <cstdio>
#include <string>
#include <vector>
#include "Common.h"

struct OpusEncoder;

namespace scrb {

class OggOpusFile {
public:
    ~OggOpusFile();
    bool Open(const std::wstring& path, const std::vector<std::string>& tags);
    bool Write(const int16_t* pcm, uint32_t frames);
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

private:
    std::wstring dir_;
    std::wstring tmpPath_;
    std::wstring finalPath_;
    OggOpusFile file_;
    FILE* index_ = nullptr;
};

std::wstring Widen(const std::string& utf8);
std::string Narrow(const std::wstring& wide);

}  // namespace scrb
