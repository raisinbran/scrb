#define _CRT_SECURE_NO_WARNINGS
#include "Session.h"

#include <mmdeviceapi.h>
#include <powrprof.h>
#include <shlobj.h>
#include <stdexcept>

#pragma comment(lib, "powrprof.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "shell32.lib")

using Microsoft::WRL::ComPtr;

namespace scrb {

namespace {

constexpr int64_t kStallNs = 500 * kNsPerMs;  // D3
constexpr int64_t kRetryNs = kNsPerSec;
// Long enough that a mic which drops briefly comes back instead of being swapped.
constexpr int64_t kMicFallbackNs = 5 * kNsPerSec;
constexpr int64_t kWatchdogTickNs = 100 * kNsPerMs;

const wchar_t kConsentKey[] =
    L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";

bool ConsentDeny(HKEY root, const std::wstring& key) {
    wchar_t value[16] = {};
    DWORD size = sizeof value;
    return RegGetValueW(root, key.c_str(), L"Value", RRF_RT_REG_SZ, nullptr, value, &size) == ERROR_SUCCESS &&
           _wcsicmp(value, L"Deny") == 0;
}

DWORD AudioServicePid() {
    DWORD pid = 0;
    if (SC_HANDLE manager = OpenSCManagerW(nullptr, nullptr, SC_MANAGER_CONNECT)) {
        if (SC_HANDLE service = OpenServiceW(manager, L"Audiosrv", SERVICE_QUERY_STATUS)) {
            SERVICE_STATUS_PROCESS status = {};
            DWORD size = 0;
            if (QueryServiceStatusEx(service, SC_STATUS_PROCESS_INFO, reinterpret_cast<BYTE*>(&status), sizeof status,
                                     &size))
                pid = status.dwProcessId;
            CloseServiceHandle(service);
        }
        CloseServiceHandle(manager);
    }
    return pid;
}

class Notifier : public IMMNotificationClient {
public:
    explicit Notifier(Session* session) : session_(session) {}
    STDMETHOD(QueryInterface)(REFIID iid, void** out) override {
        if (iid == __uuidof(IUnknown) || iid == __uuidof(IMMNotificationClient)) {
            *out = static_cast<IMMNotificationClient*>(this);
            AddRef();
            return S_OK;
        }
        *out = nullptr;
        return E_NOINTERFACE;
    }
    STDMETHOD_(ULONG, AddRef)() override { return ++refs_; }
    STDMETHOD_(ULONG, Release)() override {
        ULONG n = --refs_;
        if (!n) delete this;
        return n;
    }
    STDMETHOD(OnDefaultDeviceChanged)(EDataFlow flow, ERole role, LPCWSTR id) override {
        Session* s = session_;
        bool capture = flow == eCapture;
        bool console = role == eConsole;
        const char* roleName = console ? "console" : role == eCommunications ? "communications" : "multimedia";
        std::string name = id ? Narrow(id) : "";
        int64_t at = NowNs();
        s->Post([=] {
            s->OnDefaultNotice(capture, roleName, name, at);
            if (console) s->OnDefaultChanged(capture);
        });
        return S_OK;
    }
    STDMETHOD(OnDeviceAdded)(LPCWSTR) override { return S_OK; }
    STDMETHOD(OnDeviceRemoved)(LPCWSTR id) override {
        std::string name = Narrow(id);
        Session* s = session_;
        s->Post([s, name] { s->OnDeviceGone(name); });
        return S_OK;
    }
    STDMETHOD(OnDeviceStateChanged)(LPCWSTR id, DWORD state) override {
        std::string name = Narrow(id);
        Session* s = session_;
        if (state == DEVICE_STATE_ACTIVE) s->Post([s, name] { s->OnDeviceActive(name); });
        else s->Post([s, name] { s->OnDeviceGone(name); });
        return S_OK;
    }
    STDMETHOD(OnPropertyValueChanged)(LPCWSTR, const PROPERTYKEY) override { return S_OK; }

private:
    std::atomic<ULONG> refs_{1};
    Session* session_;
};

ULONG CALLBACK PowerCallback(PVOID context, ULONG type, PVOID) {
    auto* s = static_cast<Session*>(context);
    if (type == PBT_APMSUSPEND) s->OnPower(true);
    else if (type == PBT_APMRESUMEAUTOMATIC || type == PBT_APMRESUMESUSPEND) s->OnPower(false);
    return 0;
}

std::string Arg(const Command& cmd, const char* key, const std::string& fallback = "") {
    auto i = cmd.find(key);
    return i == cmd.end() ? fallback : i->second;
}

// Arrays reach here as written, such as [12,34].
std::vector<int64_t> ParseNumbers(const std::string& raw) {
    std::vector<int64_t> out;
    for (size_t i = raw.find_first_of("-0123456789"); i != std::string::npos;
         i = raw.find_first_of("-0123456789", raw.find_first_not_of("-0123456789", i))) {
        out.push_back(_atoi64(raw.c_str() + i));
    }
    return out;
}

std::vector<std::string> ParseStrings(const std::string& raw) {
    std::vector<std::string> out;
    for (size_t open = raw.find('"'); open != std::string::npos; open = raw.find('"', open + 1)) {
        size_t close = raw.find('"', open + 1);
        if (close == std::string::npos) break;
        out.push_back(raw.substr(open + 1, close - open - 1));
        open = close;
    }
    return out;
}

std::mutex g_emitMutex;
std::condition_variable g_emitCv;
std::deque<std::string> g_emitQueue;
bool g_emitBusy = false;

void EmitterLoop() {
    for (;;) {
        std::string line;
        {
            std::unique_lock<std::mutex> lock(g_emitMutex);
            g_emitCv.wait(lock, [] { return !g_emitQueue.empty(); });
            line = std::move(g_emitQueue.front());
            g_emitQueue.pop_front();
            g_emitBusy = true;
        }
        fwrite(line.data(), 1, line.size(), stdout);
        fputc('\n', stdout);
        fflush(stdout);
        {
            std::lock_guard<std::mutex> lock(g_emitMutex);
            g_emitBusy = false;
        }
        g_emitCv.notify_all();
    }
}

}  // namespace

void EmitLine(const std::string& json) {
    static std::thread emitter = [] {
        std::thread t(EmitterLoop);
        t.detach();
        return std::move(t);
    }();
    {
        std::lock_guard<std::mutex> lock(g_emitMutex);
        g_emitQueue.push_back(json);
    }
    g_emitCv.notify_all();
}

void FlushEmitter() {
    std::unique_lock<std::mutex> lock(g_emitMutex);
    g_emitCv.wait_for(lock, std::chrono::seconds(2), [] { return g_emitQueue.empty() && !g_emitBusy; });
}

Session::Session(SessionOptions options) : options_(options) {
    RebuildNotifier();
    DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS params{PowerCallback, this};
    HPOWERNOTIFY handle = nullptr;
    if (PowerRegisterSuspendResumeNotification(DEVICE_NOTIFY_CALLBACK, &params, &handle) == ERROR_SUCCESS)
        powerHandle_ = handle;
    watchdog_ = std::thread([this] { WatchdogLoop(); });
}

Session::~Session() {
    watchdogStop_ = true;
    watchdog_.join();
    if (powerHandle_) PowerUnregisterSuspendResumeNotification(static_cast<HPOWERNOTIFY>(powerHandle_));
    if (enumerator_ && notifier_) enumerator_->UnregisterEndpointNotificationCallback(static_cast<Notifier*>(notifier_));
    if (notifier_) static_cast<Notifier*>(notifier_)->Release();
    if (target_) CloseHandle(target_);
}

void Session::RebuildNotifier() {
    if (enumerator_ && notifier_) enumerator_->UnregisterEndpointNotificationCallback(static_cast<Notifier*>(notifier_));
    enumerator_.Reset();
    if (!notifier_) notifier_ = new Notifier(this);
    if (SUCCEEDED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator_))))
        enumerator_->RegisterEndpointNotificationCallback(static_cast<Notifier*>(notifier_));
}

void Session::Post(std::function<void()> fn) {
    {
        std::lock_guard<std::mutex> lock(queueMutex_);
        queue_.push_back(std::move(fn));
    }
    queueCv_.notify_one();
}

void Session::RequestQuit() { quit_ = true; queueCv_.notify_one(); }

void Session::Run() {
    while (!quit_) {
        std::function<void()> fn;
        {
            std::unique_lock<std::mutex> lock(queueMutex_);
            queueCv_.wait_for(lock, std::chrono::milliseconds(50), [this] { return !queue_.empty() || quit_; });
            if (!queue_.empty()) {
                fn = std::move(queue_.front());
                queue_.pop_front();
            }
        }
        if (fn) fn();
        Tick();
    }
}

void Session::Emit(const std::string& name, const JsonObject& fields) {
    std::string utc;
    int64_t wall = 0;
    ReadWall(&utc, &wall);
    std::string body = fields.Done();
    std::string prefix = "{\"type\":\"event\",\"event\":\"" + name + "\",\"wall\":\"" + utc + "\"";
    EmitLine(prefix + (body.size() > 2 ? "," + body.substr(1) : "}"));
}

std::string Session::ActiveTracks() const {
    std::string out = "[";
    if (slots_[kMic].track && slots_[kMic].track->streamOpen()) out += "\"microphone\"";
    if (slots_[kMeeting].track && slots_[kMeeting].track->streamOpen())
        out += out.size() > 1 ? ",\"meeting\"" : "\"meeting\"";
    return out + "]";
}

void Session::Reply(const Command& cmd, bool ok, const std::string& extraKey, const std::string& extraJson,
                    std::optional<int64_t> atNs, std::optional<int64_t> clockOriginNs) {
    std::string id = Arg(cmd, "id"), name = Arg(cmd, "name");
    JsonObject o;
    o.Str("type", "ack").Str("id", id).Str("cmd", name).Bool("ok", ok).Str("gate", gate_.IsOpen() ? "open" : "closed")
        .Raw("activeTracks", ActiveTracks()).Raw("atNs", atNs ? std::to_string(*atNs) : "null");
    if (!extraKey.empty()) o.Raw(extraKey.c_str(), extraJson);
    if (clockOriginNs) o.Int("clockOriginNs", *clockOriginNs);
    std::string line = o.Done();
    // Lists change nothing, so their replies are not kept for retries.
    if (!id.empty() && name != "listMics" && name != "listApps") acks_[id] = line;
    EmitLine(line);
}

void Session::Handle(const Command& cmd) {
    auto kept = acks_.find(Arg(cmd, "id"));
    if (kept != acks_.end()) return EmitLine(kept->second);
    std::string name = Arg(cmd, "name");
    if (name == "open") DoOpen(cmd);
    else if (name == "start") DoStart(cmd);
    else if (name == "pause") DoPause(cmd);
    else if (name == "resume") DoResume(cmd);
    else if (name == "stop") DoStop(cmd);
    else if (name == "selectMic") DoSelectMic(cmd);
    else if (name == "selectSource") DoSelectSource(cmd);
    else if (name == "checkPermission") Reply(cmd, true, "systemAudio", "\"granted\"");  // no such permission here
    else if (name == "listMics") Reply(cmd, true, "mics", ListMicsJson());
    else if (name == "listApps") Reply(cmd, true, "apps", ListAppsJson(ParseStrings(Arg(cmd, "include"))));
    else if (name == "inject" && options_.testHooks) DoInject(cmd);
    else if (name == "quit") {
        if (state_ == "recording" || state_ == "paused" || state_ == "open") DoStop(cmd);
        else Reply(cmd, true);
        quit_ = true;
    } else {
        Reply(cmd, false, "error", "\"unknown or disabled command\"");
    }
}

void Session::WarnIfHandsFree(const DeviceInfo& info) {
    if (info.transport == "bluetooth-handsfree")
        Emit("handsFreeMic", JsonObject().Str("track", "microphone").Str("deviceName", info.name));
}

void Session::WatchTarget(DWORD pid) {
    if (target_) CloseHandle(target_);
    target_ = pid ? OpenProcess(SYNCHRONIZE, FALSE, pid) : nullptr;
    targetPid_ = pid;
}

// Never widens to whole-computer audio: only the user picks that (W2).
bool Session::OpenMeeting(const std::string& openReason, bool announce) {
    Slot& s = slots_[kMeeting];
    DeviceInfo info;
    if (FAILED(s.track->OpenStream(s.spec, &info))) return false;
    s.track->Post([info, openReason](TrackPipeline& p) { p.OnStreamOpened(info, openReason); });
    if (announce) Emit("streamReopened", JsonObject().Str("track", "meeting").Str("deviceName", info.name));
    return true;
}

void Session::DoOpen(const Command& cmd) {
    if (state_ != "idle") return Reply(cmd, false, "error", "\"conflict\"");
    const std::string savedOrigin = Arg(cmd, "clockOriginNs");
    continuing_ = !savedOrigin.empty();
    if (continuing_) {
        try {
            size_t used = 0;
            int64_t value = std::stoll(savedOrigin, &used);
            if (used != savedOrigin.size() || value <= 0 || value > NowNs())
                return Reply(cmd, false, "error", "\"bad clockOriginNs\"");
            originNs_ = value;
        } catch (const std::exception&) {
            return Reply(cmd, false, "error", "\"bad clockOriginNs\"");
        }
    }
    sessionId_ = Arg(cmd, "sessionId", "session");
    wchar_t root[MAX_PATH * 2];
    if (!GetFullPathNameW(Widen(Arg(cmd, "outputDir", ".")).c_str(), ARRAYSIZE(root), root, nullptr))
        return Reply(cmd, false, "error", "\"bad outputDir\"");
    std::wstring audio = std::wstring(root) + L"\\audio";
    std::wstring dirs[kTrackCount] = {audio + L"\\microphone", audio + L"\\meeting"};
    const char* names[kTrackCount] = {"microphone", "meeting"};
    SHCreateDirectoryExW(nullptr, audio.c_str(), nullptr);
    // The OS drops this the moment the process dies, however it dies.
    HANDLE lock = CreateFileW((audio + L"\\writer.lock").c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_ALWAYS,
                              FILE_ATTRIBUTE_NORMAL, nullptr);
    if (lock == INVALID_HANDLE_VALUE) return Reply(cmd, false, "error", "\"writer lock held\"");
    writerLock_ = lock;
    // An empty list is whole-computer audio; only the first process tree is captured.
    std::vector<int64_t> source = ParseNumbers(Arg(cmd, "source", "[]"));
    bool wholeComputer = source.empty();
    bool noProcess = !wholeComputer && source[0] <= 0;  // the app's marker for an app with no process
    DWORD pid = wholeComputer || noProcess ? 0 : static_cast<DWORD>(source[0]);
    EventFn emit = [this](const std::string& n, const JsonObject& f) { Emit(n, f); };
    log_ = std::make_unique<SessionLog>(audio + L"\\session.log", emit, continuing_);
    log_->Record(JsonObject().Str("event", "open").Bool("wholeComputer", wholeComputer).Done());
    if (continuing_)
        log_->Record(JsonObject().Str("event", "restart").Int("atNs", NowNs() - originNs_).Done());
    for (int i = 0; i < kTrackCount; ++i) {
        SHCreateDirectoryExW(nullptr, dirs[i].c_str(), nullptr);
        PipelineConfig c;
        c.sessionId = sessionId_;
        c.track = names[i];
        c.arrivalCheck = i == kMeeting;
        c.source = i != kMeeting ? "" : pid ? "process:" + std::to_string(pid) : noProcess ? "none" : "whole-computer";
        c.readClocks = [this](int64_t* timeline, std::string* utc, int64_t* wall) {
            *timeline = NowNs() - originNs_;
            ReadWall(utc, wall);
        };
        slots_[i] = Slot{};
        slots_[i].track = std::make_unique<Track>(std::move(c), dirs[i], gate_, emit, continuing_);
    }
    std::string mic = Arg(cmd, "mic", "default");
    slots_[kMic].spec.kind = StreamSpec::Kind::Mic;
    slots_[kMic].spec.deviceId = mic == "default" ? L"" : Widen(mic);
    slots_[kMeeting].spec.kind = wholeComputer ? StreamSpec::Kind::System : StreamSpec::Kind::Process;
    slots_[kMeeting].spec.pid = pid;
    WatchTarget(pid);

    const std::string openReason = continuing_ ? "workerRestarted" : "start";
    DeviceInfo info;
    HRESULT hr = slots_[kMic].track->OpenStream(slots_[kMic].spec, &info);
    if (hr == E_ACCESSDENIED) Emit("permissionLost", JsonObject().Str("track", "microphone"));
    if (SUCCEEDED(hr)) {
        slots_[kMic].track->Post([info, openReason](TrackPipeline& p) { p.OnStreamOpened(info, openReason); });
        WarnIfHandsFree(info);
    }
    bool meetingOk = !noProcess && OpenMeeting(openReason, false);
    if (FAILED(hr) && !meetingOk) {
        for (auto& s : slots_) s.track.reset();
        ReleaseWriter();
        Reply(cmd, false, "error", "\"no track opened\"");
        return;
    }
    // A track that works starts anyway; the other keeps retrying with its gap marked.
    if (FAILED(hr)) {
        Emit("streamDead", JsonObject().Str("track", "microphone").Int("hresult", static_cast<uint32_t>(hr)));
        slots_[kMic].needReopen = true;
    }
    if (!meetingOk) {
        Emit("streamDead", JsonObject().Str("track", "meeting").Str("message", "meeting source did not open"));
        slots_[kMeeting].needReopen = !noProcess;
    }
    // The pipelines start at the first Start or Resume: one started here would read the closed
    // gate as a pause and lose the workerRestarted reason.
    if (continuing_) SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
    state_ = continuing_ ? "paused" : "open";
    Reply(cmd, true);
}

// Before the ack, because the app seals the folder as soon as Stop is confirmed.
void Session::ReleaseWriter() {
    log_.reset();
    if (writerLock_) CloseHandle(writerLock_);
    writerLock_ = nullptr;
}

void Session::DoStart(const Command& cmd) {
    if (state_ != "open" && !(continuing_ && state_ == "paused"))
        return Reply(cmd, false, "error", "\"conflict\"");
    if (ActiveTracks() == "[]") return Reply(cmd, false, "error", "\"no track ready\"");
    if (!continuing_) originNs_ = NowNs();
    int64_t origin = originNs_;
    uint32_t generation = gate_.Generation() + 1;
    std::string utc;
    int64_t wall = 0;
    ReadWall(&utc, &wall);
    for (auto& s : slots_) s.track->Post([origin, generation](TrackPipeline& p) { p.Start(origin, generation); });
    const int64_t opened = gate_.Open(continuing_ ? NowNs() : origin);
    continuing_ = false;
    SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
    state_ = "recording";
    Reply(cmd, true, "origin", JsonObject().Int("qpcNs", origin).Str("wallUtc", utc).Done(),
          opened - origin, origin);
}

void Session::DoPause(const Command& cmd) {
    if (state_ != "recording") return Reply(cmd, false, "error", "\"conflict\"");
    // The gate moves first, then the record, so the disk can never delay the cutoff.
    int64_t at = gate_.Close(NowNs()) - originNs_;
    log_->Record(JsonObject().Str("event", "pause").Str("commandId", Arg(cmd, "id"))
                     .Str("cause", Arg(cmd, "cause", "user")).Int("atNs", at).Done());
    state_ = "paused";
    Reply(cmd, true, "", "", at);
}

void Session::DoResume(const Command& cmd) {
    if (state_ != "paused") return Reply(cmd, false, "error", "\"conflict\"");
    // With neither stream ready the gate stays closed and the app offers Retry or Stop.
    if (ActiveTracks() == "[]") return Reply(cmd, false, "error", "\"no track ready\"");
    if (continuing_) {  // restarted during a pause, so no Start comes
        int64_t origin = originNs_;
        uint32_t generation = gate_.Generation() + 1;
        for (auto& s : slots_) s.track->Post([origin, generation](TrackPipeline& p) { p.Start(origin, generation); });
        continuing_ = false;
    }
    int64_t at = gate_.Open(NowNs()) - originNs_;
    log_->Record(JsonObject().Str("event", "resume").Str("commandId", Arg(cmd, "id"))
                     .Str("cause", Arg(cmd, "cause", "user")).Int("atNs", at).Done());
    state_ = "recording";
    Reply(cmd, true, "", "", at);
}

void Session::DoStop(const Command& cmd) {
    quit_ = true;  // a worker lives for one recording
    if (state_ == "idle") return Reply(cmd, false, "error", "\"conflict\"");
    for (auto& s : slots_) s.track->stopping = true;
    int64_t now = NowNs();
    int64_t at = originNs_ ? gate_.Close(now) - originNs_ : 0;
    for (auto& s : slots_) s.track->CloseStream();
    for (auto& s : slots_) s.track->PostAndWait([](TrackPipeline& p) { p.Stop(); }, 10000);
    SetThreadExecutionState(ES_CONTINUOUS);
    // The tracks hold chunks.log open, and the app removes it when sealing.
    for (auto& s : slots_) s.track.reset();
    ReleaseWriter();
    state_ = "idle";
    Reply(cmd, true, "", "", at);
}

void Session::DoSelectMic(const Command& cmd) {
    if (!slots_[kMic].track) return Reply(cmd, false, "error", "\"not open\"");
    std::string mic = Arg(cmd, "mic", "default");
    Slot& s = slots_[kMic];
    s.spec.deviceId = mic == "default" ? L"" : Widen(mic);
    s.track->CloseStream();
    s.track->Post([](TrackPipeline& p) { p.OnStreamLost("device", "device"); });
    lostPickedMic_.clear();
    s.needReopen = true;
    s.firstFailNs = 0;
    s.nextRetryNs = 0;
    TryReopen(kMic, NowNs());
    Reply(cmd, s.track->streamOpen());
}

// Also how the core reattaches a meeting app that restarted (owner decision on Q6).
void Session::DoSelectSource(const Command& cmd) {
    if (!slots_[kMeeting].track) return Reply(cmd, false, "error", "\"not open\"");
    std::vector<int64_t> next = ParseNumbers(Arg(cmd, "source", "[]"));
    if (!next.empty() && next[0] <= 0) return Reply(cmd, false, "error", "\"no such process\"");
    DWORD pid = next.empty() ? 0 : static_cast<DWORD>(next[0]);
    Slot& s = slots_[kMeeting];
    std::string source = pid ? "process:" + std::to_string(pid) : "whole-computer";
    s.track->CloseStream();
    s.track->Post([source](TrackPipeline& p) { p.OnSourceChanged(source); });
    s.spec.kind = pid ? StreamSpec::Kind::Process : StreamSpec::Kind::System;
    s.spec.pid = pid;
    WatchTarget(pid);
    s.needReopen = false;
    Reply(cmd, OpenMeeting("source", false));
}

void Session::DoInject(const Command& cmd) {
    Slot& s = slots_[Arg(cmd, "track") == "meeting" ? kMeeting : kMic];
    if (!s.track) return Reply(cmd, false);
    int64_t ms = _atoi64(Arg(cmd, "ms").c_str());
    std::string fault = Arg(cmd, "fault");
    if (fault == "stall") s.track->hooks.stallUntilNs = NowNs() + ms * kNsPerMs;
    else if (fault == "blackhole") s.track->hooks.blackhole = ms != 0;
    else if (fault == "skew") s.track->hooks.stampSkewNs += ms * kNsPerMs;
    else return Reply(cmd, false);
    Reply(cmd, true);
}

void Session::OnDefaultNotice(bool capture, const char* role, const std::string& id, int64_t atNs) {
    Emit("defaultNotice", JsonObject().Str("track", capture ? "microphone" : "meeting").Str("role", role)
                              .Str("deviceId", id).Bool("armed", (capture ? micDebounceNs_ : outputDebounceNs_) != 0)
                              .Num("queuedMs", (NowNs() - atNs) / static_cast<double>(kNsPerMs)));
}

void Session::EmitDefaultApplied(const char* track, const char* outcome, const std::string& resolved) {
    Emit("defaultApplied", JsonObject().Str("track", track).Str("outcome", outcome).Str("deviceId", resolved));
}

void Session::OnDefaultChanged(bool capture) {
    int64_t deadline = NowNs() + options_.debounceNs;
    if (capture) {
        micDebounceNs_ = deadline;
    } else {
        outputDebounceNs_ = deadline;
        if (slots_[kMeeting].track) {
            int64_t now = NowNs();
            slots_[kMeeting].track->Post([now](TrackPipeline& p) { p.NoteOutputChange(now); });
        }
    }
}

void Session::ApplyMicDebounce() {
    Slot& s = slots_[kMic];
    if (!s.track || !s.track->streamOpen()) return EmitDefaultApplied("microphone", "streamClosed", "");
    std::wstring id;
    if (!ResolveDefaultMicId(&id)) return EmitDefaultApplied("microphone", "unresolved", "");
    std::string now = Narrow(id);
    if (now == s.track->deviceId()) return EmitDefaultApplied("microphone", "sameDevice", now);
    if (!s.spec.deviceId.empty()) {
        EmitDefaultApplied("microphone", "suggested", now);
        Emit("micSuggestion", JsonObject().Str("deviceId", now));
        return;
    }
    EmitDefaultApplied("microphone", "moved", now);
    Emit("deviceChanged", JsonObject().Str("track", "microphone").Str("deviceId", now));
    s.track->CloseStream();
    s.track->Post([](TrackPipeline& p) { p.OnStreamLost("device", "device"); });
    s.needReopen = true;
    s.nextRetryNs = 0;
    TryReopen(kMic, NowNs());
}

void Session::ApplyOutputDebounce() {
    Slot& s = slots_[kMeeting];
    if (!s.track || s.spec.kind != StreamSpec::Kind::System) return;
    if (!s.track->streamOpen()) return EmitDefaultApplied("meeting", "streamClosed", "");
    std::wstring id;
    if (!ResolveDefaultOutputId(&id)) return EmitDefaultApplied("meeting", "unresolved", "");
    if (Narrow(id) == s.track->deviceId()) return EmitDefaultApplied("meeting", "sameDevice", Narrow(id));
    EmitDefaultApplied("meeting", "moved", Narrow(id));
    Emit("deviceChanged", JsonObject().Str("track", "meeting").Str("deviceId", Narrow(id)));
    s.track->CloseStream();
    s.track->Post([](TrackPipeline& p) { p.OnStreamLost("device", "device"); });
    s.needReopen = true;
    s.nextRetryNs = 0;
    TryReopen(kMeeting, NowNs());
}

void Session::OnDeviceGone(const std::string& id) {
    for (int i = 0; i < kTrackCount; ++i) {
        Slot& s = slots_[i];
        if (s.track && s.track->streamOpen() && s.track->deviceId() == id)
            MarkDead(i, "deviceGone", AUDCLNT_E_DEVICE_INVALIDATED);
    }
}

void Session::OnDeviceActive(const std::string& id) {
    if (id == lostPickedMic_) Emit("micReturned", JsonObject().Str("deviceId", id));
}

void Session::MarkDead(int index, const std::string& reason, HRESULT hr) {
    Slot& s = slots_[index];
    if (!s.track || s.needReopen) return;
    const char* name = index == kMic ? "microphone" : "meeting";
    s.track->CloseStream();
    s.track->Post([](TrackPipeline& p) { p.OnStreamLost("device", "device"); });
    Emit("streamDead", JsonObject().Str("track", name).Str("reason", reason)
                           .Int("hresult", static_cast<uint32_t>(hr)));
    RebuildNotifier();
    s.needReopen = true;
    s.firstFailNs = 0;
    s.nextRetryNs = 0;
    s.stalled = false;
    s.deathPosted = false;
}

void Session::TryReopen(int index, int64_t now) {
    Slot& s = slots_[index];
    if (now < s.nextRetryNs) return;
    s.nextRetryNs = now + kRetryNs;
    if (index == kMeeting) {
        if (OpenMeeting("device", true)) s.needReopen = false;
        return;
    }
    if (consentDenied_) return;
    DeviceInfo info;
    HRESULT hr = s.track->OpenStream(s.spec, &info);
    if (hr == E_ACCESSDENIED && !s.firstFailNs) Emit("permissionLost", JsonObject().Str("track", "microphone"));
    if (FAILED(hr) && !s.spec.deviceId.empty() && s.firstFailNs && now - s.firstFailNs >= kMicFallbackNs) {
        // Owner decision on Q12: keep recording on the default and warn.
        lostPickedMic_ = Narrow(s.spec.deviceId);
        s.spec.deviceId.clear();
        hr = s.track->OpenStream(s.spec, &info);
        if (SUCCEEDED(hr))
            Emit("micFallback", JsonObject().Str("fromDeviceId", lostPickedMic_).Str("toDeviceName", info.name));
    }
    if (FAILED(hr)) {
        if (!s.firstFailNs) s.firstFailNs = now;
        return;
    }
    s.track->Post([info](TrackPipeline& p) { p.OnStreamOpened(info, "device"); });
    s.needReopen = false;
    Emit("streamReopened", JsonObject().Str("track", "microphone").Str("deviceName", info.name));
    WarnIfHandsFree(info);
}

void Session::CheckConsent() {
    Slot& s = slots_[kMic];
    if (!s.track) return;
    std::wstring key = kConsentKey;
    bool denied = ConsentDeny(HKEY_CURRENT_USER, key) || ConsentDeny(HKEY_CURRENT_USER, key + L"\\NonPackaged") ||
                  ConsentDeny(HKEY_LOCAL_MACHINE, key);
    if (denied == consentDenied_) return;
    consentDenied_ = denied;
    if (denied) {
        Emit("permissionLost", JsonObject().Str("track", "microphone").Str("reason", "consentDenied"));
        s.track->CloseStream();
        s.track->Post([](TrackPipeline& p) { p.OnStreamLost("permission", "permission"); });
        s.needReopen = true;
    } else {
        Emit("permissionRestored", JsonObject().Str("track", "microphone"));
        if (!s.needReopen && s.track->streamOpen()) MarkDead(kMic, "consentRestored", S_OK);
        s.nextRetryNs = 0;
    }
}

// A process loopback stream gives no error when Windows Audio restarts: it keeps
// delivering silence and never hears the target again.  So reopen on a new PID.
void Session::CheckAudioService() {
    DWORD pid = AudioServicePid();
    if (!pid || pid == audioServicePid_) return;
    bool restarted = audioServicePid_ != 0;
    audioServicePid_ = pid;
    if (!restarted) return;
    for (int i = 0; i < kTrackCount; ++i)
        if (slots_[i].track && slots_[i].track->streamOpen()) MarkDead(i, "audioServiceRestart", S_OK);
}

void Session::OnPower(bool suspending) {
    if (suspending == sleeping_.exchange(suspending)) return;
    int64_t now = NowNs();
    if (suspending) Emit("sleeping", JsonObject().Int("atNs", now - originNs_));
    else Emit("woke", JsonObject().Int("atNs", now - originNs_));
    for (auto& s : slots_) {
        if (!s.track) continue;
        if (suspending) {
            s.track->PostAndWait([](TrackPipeline& p) { p.OnSleep(); }, 1000);
        } else {
            s.track->lastArrivalNs = now;
            s.track->Post([now](TrackPipeline& p) { p.OnWake(now); });
        }
    }
}

void Session::TickSecond(int64_t now) {
    CheckConsent();
    CheckAudioService();
    if (target_ && WaitForSingleObject(target_, 0) == WAIT_OBJECT_0 && slots_[kMeeting].track) {
        // The core owns the grace period and auto-pause (owner decision on Q6).
        Emit("sourceChanged", JsonObject().Bool("alive", false).Str("track", "meeting").Str("reason", "targetExited")
                                  .Int("pid", targetPid_));
        Slot& s = slots_[kMeeting];
        s.track->CloseStream();
        s.track->Post([](TrackPipeline& p) { p.OnSourceChanged("none"); });
        WatchTarget(0);
    }
    if (slots_[kMic].track)
        Emit("health", JsonObject().Num("micDb", slots_[kMic].track->levelCentiDb / 100.0)
                           .Num("meetingDb", slots_[kMeeting].track->levelCentiDb / 100.0));
    for (int i = 0; i < kTrackCount; ++i) {
        Slot& s = slots_[i];
        if (!s.track) continue;
        const Stats& st = s.track->stats();
        Emit("trackHealth", JsonObject().Str("track", i == kMic ? "microphone" : "meeting")
                           .Num("levelDb", s.track->levelCentiDb / 100.0)
                           .Int("packets", static_cast<int64_t>(st.packets.load()))
                           .Int("chunks", static_cast<int64_t>(st.chunks.load()))
                           .Int("missingMs", static_cast<int64_t>(st.missingMs.load()))
                           .Str("device", s.track->device().name).Int("rate", kRate)
                           .Bool("streamOpen", s.track->streamOpen()));
    }
}

void Session::Tick() {
    int64_t now = NowNs();
    if (micDebounceNs_ && now >= micDebounceNs_) {
        micDebounceNs_ = 0;
        ApplyMicDebounce();
    }
    if (outputDebounceNs_ && now >= outputDebounceNs_) {
        outputDebounceNs_ = 0;
        ApplyOutputDebounce();
    }
    for (int i = 0; i < kTrackCount; ++i) {
        Slot& s = slots_[i];
        if (!s.track) continue;
        HRESULT dead = s.track->deadHr;
        if (dead != S_OK && !s.needReopen && s.track->streamOpen()) MarkDead(i, "deviceSignal", dead);
        if (s.needReopen && !sleeping_) TryReopen(i, now);
    }
    if (now - lastSecondNs_ >= kNsPerSec) {
        lastSecondNs_ = now;
        TickSecond(now);
    }
}

// Separate from the control thread because a reopen can block there for seconds.
void Session::WatchdogLoop() {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    int64_t last = NowNs();
    int64_t lateTickNs = 0;
    ULONGLONG unbiased = 0;
    QueryUnbiasedInterruptTime(&unbiased);
    int64_t lastBias = last - static_cast<int64_t>(unbiased) * 100;
    while (!watchdogStop_) {
        Sleep(static_cast<DWORD>(kWatchdogTickNs / kNsPerMs));
        int64_t now = NowNs();
        int64_t lateNs = now - last - kWatchdogTickNs;
        last = now;
        if (lateNs > kStallNs) lateTickNs = now;
        QueryUnbiasedInterruptTime(&unbiased);
        int64_t bias = now - static_cast<int64_t>(unbiased) * 100;
        bool slept = bias - lastBias > kStallNs;  // D9: the power notification was missed
        lastBias = bias;
        if (slept && !sleeping_) {
            Post([this] { OnPower(true); OnPower(false); });
            continue;
        }
        if (sleeping_) continue;
        for (int i = 0; i < kTrackCount; ++i) {
            Slot& s = slots_[i];
            Track* t = s.track.get();
            if (!t || !t->streamOpen()) continue;
            int64_t gap = now - t->lastArrivalNs;
            const char* name = i == kMic ? "microphone" : "meeting";
            if (gap > kStallNs && !s.stalled) {
                s.stalled = true;
                Emit("streamStalled", JsonObject().Str("track", name).Num("gapMs", NsToMs(gap))
                                          .Bool("watchdogLate", lateTickNs >= t->lastArrivalNs));
            } else if (gap <= kStallNs) {
                s.stalled = false;
                s.deathPosted = false;
            }
            int64_t since = lateTickNs > t->lastArrivalNs ? lateTickNs : t->lastArrivalNs.load();
            if (now - since > options_.deathLimitNs && !s.deathPosted) {
                s.deathPosted = true;
                Post([this, i] { MarkDead(i, "noPackets", S_OK); });
            }
        }
    }
    CoUninitialize();
}

}  // namespace scrb
