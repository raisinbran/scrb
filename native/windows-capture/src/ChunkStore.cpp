#define _CRT_SECURE_NO_WARNINGS
#include "ChunkStore.h"

#include <Windows.h>
#include <io.h>
#include <opus.h>

#include <algorithm>
#include <cinttypes>
#include <cstring>

namespace scrb {

namespace {

constexpr int kFrameSamples = 960;  // 20 ms at 48 kHz
constexpr int kPacketsPerPage = 50;
constexpr int kMaxPacket = 1500;

uint32_t OggCrc(const uint8_t* data, size_t size) {
    static uint32_t table[256];
    static bool ready = [] {
        for (uint32_t i = 0; i < 256; ++i) {
            uint32_t r = i << 24;
            for (int b = 0; b < 8; ++b) r = (r & 0x80000000u) ? (r << 1) ^ 0x04c11db7u : r << 1;
            table[i] = r;
        }
        return true;
    }();
    (void)ready;
    uint32_t crc = 0;
    for (size_t i = 0; i < size; ++i) crc = (crc << 8) ^ table[((crc >> 24) ^ data[i]) & 0xff];
    return crc;
}

void Put32(std::vector<uint8_t>& v, uint32_t x) {
    for (int i = 0; i < 4; ++i) v.push_back(static_cast<uint8_t>(x >> (8 * i)));
}

void PutString(std::vector<uint8_t>& v, const std::string& s) {
    Put32(v, static_cast<uint32_t>(s.size()));
    v.insert(v.end(), s.begin(), s.end());
}

std::vector<uint8_t> LacingFor(size_t size) {
    std::vector<uint8_t> lacing(size / 255, 255);
    lacing.push_back(static_cast<uint8_t>(size % 255));
    return lacing;
}

std::vector<uint8_t> OpusTagsBody(const std::vector<std::string>& tags) {
    std::vector<uint8_t> comment = {'O', 'p', 'u', 's', 'T', 'a', 'g', 's'};
    PutString(comment, opus_get_version_string());
    Put32(comment, static_cast<uint32_t>(tags.size()));
    for (const auto& t : tags) PutString(comment, t);
    return comment;
}

// Recovery reads these from the file, so a chunk can be listed with no log.
// START_NS has a fixed width, which lets StartMoved rewrite the page in place.
std::vector<std::string> ChunkTags(const ChunkMeta& m) {
    char start[32];
    snprintf(start, sizeof start, "START_NS=%019" PRId64, m.startNs);
    return {"TRACK=" + m.track, "SESSION=" + m.chunkId.substr(0, m.chunkId.size() - m.track.size() - 8),
            "SEQUENCE=" + std::to_string(m.seq), start, "RATE=" + std::to_string(m.rate),
            "OPEN_REASON=" + m.openReason, "SCRB_CHUNK_ID=" + m.chunkId,
            "SCRB_DEVICE_STAMP_NS=" + std::to_string(m.deviceStampNs), "SCRB_WALL_UTC=" + m.wallAnchorUtc};
}

std::string ChunkName(uint64_t seq) {
    char name[32];
    snprintf(name, sizeof name, "%06llu.opus", static_cast<unsigned long long>(seq));
    return name;
}

// The fields recovery reads come first.  The rest are what only close time knows.
std::string ChunkLogLine(const ChunkMeta& m) {
    std::string spans = "[";
    for (const auto& s : m.paddedSpans) {
        if (spans.size() > 1) spans += ",";
        spans += JsonObject().Num("offsetMs", s.offsetMs).Num("lengthMs", s.lengthMs).Str("cause", s.cause).Done();
    }
    return JsonObject()
               .Str("file", ChunkName(m.seq)).Int("seq", static_cast<int64_t>(m.seq)).Int("startNs", m.startNs)
               .Int("endNs", m.startNs + FramesToNs(m.frames)).Int("frames", static_cast<int64_t>(m.frames))
               .Int("rate", m.rate).Str("openReason", m.openReason).Str("closeReason", m.closeReason)
               .Bool("allZero", m.allZero).Num("missingBeforeMs", m.missingBeforeMs)
               .Str("missingCause", m.missingCause).Num("overlapMs", m.overlapMs)
               .Str("transport", m.device.transport).Raw("paddedSpans", spans + "]")
               .Done() + "\n";
}

}  // namespace

std::wstring Widen(const std::string& s) {
    if (s.empty()) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring r(n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), r.data(), n);
    return r;
}

std::string Narrow(const std::wstring& s) {
    if (s.empty()) return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0, nullptr, nullptr);
    std::string r(n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), r.data(), n, nullptr, nullptr);
    return r;
}

OggOpusFile::~OggOpusFile() {
    if (encoder_) opus_encoder_destroy(encoder_);
    if (file_) CloseHandle(file_);
}

bool OggOpusFile::WritePage(const std::vector<uint8_t>& body, const std::vector<uint8_t>& lacing,
                            uint8_t flags, uint64_t granule) {
    std::vector<uint8_t> page = {'O', 'g', 'g', 'S', 0, flags};
    for (int i = 0; i < 8; ++i) page.push_back(static_cast<uint8_t>(granule >> (8 * i)));
    Put32(page, serial_);
    Put32(page, pageSeq_++);
    Put32(page, 0);
    page.push_back(static_cast<uint8_t>(lacing.size()));
    page.insert(page.end(), lacing.begin(), lacing.end());
    page.insert(page.end(), body.begin(), body.end());
    uint32_t crc = OggCrc(page.data(), page.size());
    memcpy(&page[22], &crc, 4);
    DWORD written = 0;
    if (!WriteFile(file_, page.data(), static_cast<DWORD>(page.size()), &written, nullptr) ||
        written != page.size()) {
        ok_ = false;
    }
    return ok_;
}

bool OggOpusFile::Open(const std::wstring& path, const std::vector<std::string>& tags) {
    if (encoder_) opus_encoder_destroy(encoder_);
    encoder_ = nullptr;
    if (file_) CloseHandle(file_);
    file_ = nullptr;
    ok_ = true;
    pageSeq_ = 0;
    inputFrames_ = encodedFrames_ = 0;
    pending_.clear();
    pageBody_.clear();
    pageLacing_.clear();
    pagePackets_ = 0;

    int err = 0;
    encoder_ = opus_encoder_create(kRate, 1, OPUS_APPLICATION_VOIP, &err);
    if (err != OPUS_OK) return ok_ = false;
    opus_encoder_ctl(encoder_, OPUS_SET_BITRATE(32000));
    opus_encoder_ctl(encoder_, OPUS_SET_VBR(1));
    opus_encoder_ctl(encoder_, OPUS_SET_VBR_CONSTRAINT(1));
    opus_encoder_ctl(encoder_, OPUS_SET_COMPLEXITY(10));
    opus_encoder_ctl(encoder_, OPUS_GET_LOOKAHEAD(&preSkip_));

    HANDLE h = CreateFileW(path.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return ok_ = false;
    file_ = h;
    LARGE_INTEGER q;
    QueryPerformanceCounter(&q);
    serial_ = static_cast<uint32_t>(q.QuadPart);

    std::vector<uint8_t> head = {'O', 'p', 'u', 's', 'H', 'e', 'a', 'd', 1, 1};
    head.push_back(static_cast<uint8_t>(preSkip_));
    head.push_back(static_cast<uint8_t>(preSkip_ >> 8));
    Put32(head, kRate);
    head.insert(head.end(), {0, 0, 0});
    if (!WritePage(head, LacingFor(head.size()), 2, 0)) return false;

    LARGE_INTEGER at{}, end{};
    SetFilePointerEx(file_, at, &end, FILE_CURRENT);
    tagsOffset_ = end.QuadPart;
    auto comment = OpusTagsBody(tags);
    return WritePage(comment, LacingFor(comment.size()), 0, 0);
}

bool OggOpusFile::Retag(const std::vector<std::string>& tags) {
    if (!file_) return false;
    uint32_t nextPage = pageSeq_;
    pageSeq_ = 1;
    LARGE_INTEGER at{}, end{};
    at.QuadPart = tagsOffset_;
    SetFilePointerEx(file_, at, nullptr, FILE_BEGIN);
    auto comment = OpusTagsBody(tags);
    bool result = WritePage(comment, LacingFor(comment.size()), 0, 0);
    pageSeq_ = nextPage;
    at.QuadPart = 0;
    SetFilePointerEx(file_, at, &end, FILE_END);
    return result;
}

bool OggOpusFile::EncodeFrame(const int16_t* frame) {
    uint8_t packet[kMaxPacket];
    int size = opus_encode(encoder_, frame, kFrameSamples, packet, kMaxPacket);
    if (size < 0) return ok_ = false;
    auto lacing = LacingFor(static_cast<size_t>(size));
    if (pageLacing_.size() + lacing.size() > 255 && !FlushPage(false)) return false;
    pageBody_.insert(pageBody_.end(), packet, packet + size);
    pageLacing_.insert(pageLacing_.end(), lacing.begin(), lacing.end());
    encodedFrames_ += kFrameSamples;
    if (++pagePackets_ >= kPacketsPerPage) return FlushPage(false);
    return ok_;
}

bool OggOpusFile::FlushPage(bool last) {
    if (pageBody_.empty() && !last) return ok_;
    uint64_t granule = last ? preSkip_ + inputFrames_ : encodedFrames_;
    bool result = WritePage(pageBody_, pageLacing_, last ? 4 : 0, granule);
    pageBody_.clear();
    pageLacing_.clear();
    pagePackets_ = 0;
    return result;
}

bool OggOpusFile::Write(const int16_t* pcm, uint32_t frames) {
    if (!encoder_ || !file_) return false;
    inputFrames_ += frames;
    pending_.insert(pending_.end(), pcm, pcm + frames);
    size_t used = 0;
    while (pending_.size() - used >= kFrameSamples) {
        if (!EncodeFrame(pending_.data() + used)) return false;
        used += kFrameSamples;
    }
    pending_.erase(pending_.begin(), pending_.begin() + used);
    return ok_;
}

bool OggOpusFile::Close() {
    if (!encoder_ || !file_) return false;
    // The encoder delays output by preSkip_ samples; feed silence past the last real frame.
    uint64_t needed = inputFrames_ + preSkip_;
    pending_.resize(kFrameSamples, 0);
    while (encodedFrames_ < needed) {
        if (!EncodeFrame(pending_.data())) return false;
        std::fill(pending_.begin(), pending_.end(), static_cast<int16_t>(0));
    }
    FlushPage(true);
    bool flushed = FlushFileBuffers(file_) != 0;
    CloseHandle(file_);
    file_ = nullptr;
    return ok_ && flushed;
}

ChunkStore::ChunkStore(const std::wstring& dir) : dir_(dir) {
    WIN32_FIND_DATAW found;
    HANDLE search = FindFirstFileW((dir + L"\\??????.opus*").c_str(), &found);
    if (search != INVALID_HANDLE_VALUE) {
        do {
            firstSeq_ = (std::max)(firstSeq_, static_cast<uint64_t>(_wtoi64(found.cFileName)) + 1);
        } while (FindNextFileW(search, &found));
        FindClose(search);
    }
    log_ = _wfopen((dir + L"\\chunks.log").c_str(), L"ab");
}

ChunkStore::~ChunkStore() {
    if (log_) fclose(log_);
}

bool ChunkStore::Begin(const ChunkMeta& meta) {
    finalPath_ = dir_ + L"\\" + Widen(ChunkName(meta.seq));
    partPath_ = finalPath_ + L".part";
    return file_.Open(partPath_, ChunkTags(meta));
}

void ChunkStore::StartMoved(const ChunkMeta& meta) { file_.Retag(ChunkTags(meta)); }

bool ChunkStore::Write(const int16_t* pcm, uint32_t frames) { return file_.Write(pcm, frames); }

bool ChunkStore::End(const ChunkMeta& meta) {
    bool ok = file_.Close();
    ok = MoveFileExW(partPath_.c_str(), finalPath_.c_str(), MOVEFILE_WRITE_THROUGH) != 0 && ok;
    if (log_) {
        std::string line = ChunkLogLine(meta);
        fwrite(line.data(), 1, line.size(), log_);
        fflush(log_);
        _commit(_fileno(log_));
    }
    return ok;
}

SessionLog::SessionLog(const std::wstring& path, EventFn emit) : emit_(std::move(emit)) {
    file_ = _wfopen(path.c_str(), L"ab");
    thread_ = std::thread([this] { Loop(); });
}

SessionLog::~SessionLog() {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        stop_ = true;
    }
    cv_.notify_all();
    thread_.join();
    if (file_) fclose(file_);
}

void SessionLog::Record(const std::string& jsonObject) {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        std::string line = jsonObject.substr(0, jsonObject.size() - 1);
        queue_.push_back(line + ",\"seq\":" + std::to_string(++seq_) + "}\n");
    }
    cv_.notify_all();
}

void SessionLog::Loop() {
    for (;;) {
        std::string line;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock, [this] { return stop_ || !queue_.empty(); });
            if (queue_.empty()) return;
            line = std::move(queue_.front());
            queue_.pop_front();
        }
        // A failed write leaves the pause standing; the app warns.
        bool ok = file_ && fwrite(line.data(), 1, line.size(), file_) == line.size() && fflush(file_) == 0 &&
                  _commit(_fileno(file_)) == 0;
        if (!ok) emit_("writeError", JsonObject().Str("message", "session.log write failed"));
    }
}

}  // namespace scrb
