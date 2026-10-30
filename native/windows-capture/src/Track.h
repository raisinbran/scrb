// One capture stream plus its writer.  The capture thread only copies packets
// into a queue; the writer thread owns the pipeline and the disk, so a slow
// disk can never delay reading from WASAPI.
#pragma once
#include <Windows.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <wrl/client.h>

#include <atomic>
#include <condition_variable>
#include <deque>
#include <memory>
#include <mutex>
#include <thread>

#include "ChunkStore.h"
#include "TrackPipeline.h"

namespace scrb {

int64_t NowNs();
void ReadWall(std::string* utc, int64_t* wallNs);

struct StreamSpec {
    enum class Kind { Mic, Process, System } kind = Kind::Mic;
    DWORD pid = 0;
    std::wstring deviceId;  // Mic only; empty follows the system default
};

bool ResolveDefaultMicId(std::wstring* id);
bool ResolveDefaultOutputId(std::wstring* id);
std::string ListMicsJson();
// One row per app that has an audio session.  Its pids are the roots of its process
// trees, since process loopback captures a whole tree.
std::string ListAppsJson(const std::vector<std::string>& include);

struct FaultHooks {
    std::atomic<int64_t> stallUntilNs{0};   // reader stops, Windows keeps buffering
    std::atomic<bool> blackhole{false};     // packets vanish, as a silently dead stream
    std::atomic<int64_t> stampSkewNs{0};    // stamps fall behind the clock
};

class Track {
public:
    Track(PipelineConfig config, const std::wstring& dir, const Gate& gate, EventFn emit);
    ~Track();

    HRESULT OpenStream(const StreamSpec& spec, DeviceInfo* info);
    void CloseStream();
    void Post(std::function<void(TrackPipeline&)> fn);
    // False if the writer did not finish within timeoutMs; fn still runs later.
    bool PostAndWait(std::function<void(TrackPipeline&)> fn, DWORD timeoutMs);

    bool streamOpen() const { return streamOpen_; }
    const std::string& deviceId() const { return openDevice_.id; }
    const DeviceInfo& device() const { return openDevice_; }
    const Stats& stats() const { return pipeline_->stats(); }

    std::atomic<int64_t> lastArrivalNs{0};
    std::atomic<HRESULT> deadHr{S_OK};
    std::atomic<int> levelCentiDb{-12000};  // ahead of the gate, so meters run during a pause
    std::atomic<bool> stopping{false};
    FaultHooks hooks;

private:
    struct Item {
        std::unique_ptr<Packet> packet;
        std::function<void(TrackPipeline&)> call;
    };
    void CaptureLoop();
    void WriterLoop();
    void Enqueue(Item item);
    void TopUpRender();

    const Gate& gate_;
    ChunkStore store_;
    std::unique_ptr<TrackPipeline> pipeline_;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::deque<Item> queue_;
    bool writerStop_ = false;
    std::thread writer_;

    std::thread capture_;
    std::atomic<bool> captureStop_{false};
    bool streamOpen_ = false;
    DeviceInfo openDevice_;
    Microsoft::WRL::ComPtr<IAudioClient> client_;
    Microsoft::WRL::ComPtr<IAudioCaptureClient> captureClient_;
    Microsoft::WRL::ComPtr<IAudioClient> renderClient_;  // keeps endpoint loopback delivering
    Microsoft::WRL::ComPtr<IAudioRenderClient> renderService_;
    Microsoft::WRL::ComPtr<IAudioSessionControl> sessionControl_;
    Microsoft::WRL::ComPtr<IAudioSessionEvents> sessionEvents_;
    HANDLE event_ = nullptr;
    uint32_t renderBufferFrames_ = 0;
};

}  // namespace scrb
