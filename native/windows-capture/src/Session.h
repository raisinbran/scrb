// Command handling, device and power notifications, watchdog and stream
// recovery for one helper process.  Commands and notifications all run on the
// control thread; only the watchdog and the power callback run elsewhere.
#pragma once
#include <map>
#include <memory>

#include "Track.h"

struct IMMDeviceEnumerator;

namespace scrb {

using Command = std::map<std::string, std::string>;

struct SessionOptions {
    bool testHooks = false;
    int64_t deathLimitNs = 30 * kNsPerSec;  // D4 without a device signal
    int64_t debounceNs = 5 * kNsPerSec;     // D6
};

class Session {
public:
    explicit Session(SessionOptions options);
    ~Session();
    void Post(std::function<void()> fn);
    // Runs the control loop until `quit` or stdin closes.
    void Run();
    void Handle(const Command& cmd);
    void RequestQuit();

    void OnDefaultChanged(bool capture);
    void OnDeviceGone(const std::string& id);
    void OnDeviceActive(const std::string& id);
    void OnPower(bool suspending);

private:
    enum { kMic = 0, kMeeting = 1, kTrackCount = 2 };
    struct Slot {
        std::unique_ptr<Track> track;
        StreamSpec spec;
        bool needReopen = false;
        bool triedSame = false;
        int64_t nextRetryNs = 0;
        bool stalled = false;
        bool deathPosted = false;
    };

    void Reply(const Command& cmd, bool ok, const std::string& extraKey = "", const std::string& extraJson = "");
    void Emit(const std::string& name, const JsonObject& fields);
    void Tick();
    void TickSecond(int64_t now);
    void WatchdogLoop();
    void DoOpen(const Command& cmd);
    void DoStart(const Command& cmd);
    void DoPause(const Command& cmd);
    void DoResume(const Command& cmd);
    void DoStop(const Command& cmd);
    void DoSelectMic(const Command& cmd);
    void DoSelectSource(const Command& cmd);
    void DoInject(const Command& cmd);
    bool OpenMeeting(const std::string& openReason, bool announce);
    void WatchTarget(DWORD pid);
    void MarkDead(int index, const std::string& reason, HRESULT hr);
    void TryReopen(int index, int64_t now);
    void WarnIfHandsFree(const DeviceInfo& info);
    void ApplyMicDebounce();
    void ApplyOutputDebounce();
    void CheckConsent();
    void CheckAudioService();
    void RebuildNotifier();
    std::string TrackTimes(int64_t mic, int64_t meeting);

    SessionOptions options_;
    std::mutex queueMutex_;
    std::condition_variable queueCv_;
    std::deque<std::function<void()>> queue_;
    std::atomic<bool> quit_{false};

    Slot slots_[kTrackCount];
    std::string sessionId_;
    std::string state_ = "idle";
    int64_t originNs_ = 0;
    int64_t lastSecondNs_ = 0;

    std::thread watchdog_;
    std::atomic<bool> watchdogStop_{false};
    std::atomic<bool> sleeping_{false};

    Microsoft::WRL::ComPtr<IMMDeviceEnumerator> enumerator_;
    void* notifier_ = nullptr;
    void* powerHandle_ = nullptr;
    int64_t micDebounceNs_ = 0;
    int64_t outputDebounceNs_ = 0;
    std::string lostPickedMic_;
    bool consentDenied_ = false;
    DWORD audioServicePid_ = 0;
    HANDLE target_ = nullptr;
    DWORD targetPid_ = 0;
};

// Serialized through one thread, so a parent that stops reading blocks nobody.
void EmitLine(const std::string& json);
void FlushEmitter();

}  // namespace scrb
