#define _CRT_SECURE_NO_WARNINGS
#include "Track.h"

#include <initguid.h>
#include <propkeydef.h>

#include <audioclientactivationparams.h>
#include <avrt.h>
#include <functiondiscoverykeys_devpkey.h>
#include <mmdeviceapi.h>
#include <tlhelp32.h>
#include <wrl/implements.h>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <map>
#include <set>

#pragma comment(lib, "mmdevapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "avrt.lib")
#pragma comment(lib, "version.lib")

using Microsoft::WRL::ComPtr;

namespace scrb {

namespace {

constexpr size_t kMaxQueuedPackets = 6000;  // 60 s; beyond it the stamps record a gap
constexpr REFERENCE_TIME kMicBuffer = 20000000;  // 2 s, against F4 stalls

int64_t QpcFrequency() {
    static int64_t f = [] {
        LARGE_INTEGER q;
        QueryPerformanceFrequency(&q);
        return q.QuadPart;
    }();
    return f;
}

WAVEFORMATEX MakeFormat() {
    WAVEFORMATEX f{};
    f.wFormatTag = WAVE_FORMAT_PCM;
    f.nChannels = 1;
    f.nSamplesPerSec = kRate;
    f.wBitsPerSample = 16;
    f.nBlockAlign = 2;
    f.nAvgBytesPerSec = kRate * 2;
    return f;
}

class ActivationHandler
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
          Microsoft::WRL::FtmBase, IActivateAudioInterfaceCompletionHandler> {
public:
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HRESULT result = E_FAIL;
    ComPtr<IAudioClient> client;
    ~ActivationHandler() override { CloseHandle(done); }
    STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* op) override {
        ComPtr<IUnknown> unknown;
        HRESULT activateResult = E_FAIL;
        result = op->GetActivateResult(&activateResult, &unknown);
        if (SUCCEEDED(result)) result = activateResult;
        if (SUCCEEDED(result)) result = unknown.As(&client);
        SetEvent(done);
        return S_OK;
    }
};

class SessionWatcher
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
          Microsoft::WRL::FtmBase, IAudioSessionEvents> {
public:
    explicit SessionWatcher(std::atomic<HRESULT>* dead) : dead_(dead) {}
    STDMETHOD(OnDisplayNameChanged)(LPCWSTR, LPCGUID) override { return S_OK; }
    STDMETHOD(OnIconPathChanged)(LPCWSTR, LPCGUID) override { return S_OK; }
    STDMETHOD(OnSimpleVolumeChanged)(float, BOOL, LPCGUID) override { return S_OK; }
    STDMETHOD(OnChannelVolumeChanged)(DWORD, float[], DWORD, LPCGUID) override { return S_OK; }
    STDMETHOD(OnGroupingParamChanged)(LPCGUID, LPCGUID) override { return S_OK; }
    STDMETHOD(OnStateChanged)(AudioSessionState) override { return S_OK; }
    STDMETHOD(OnSessionDisconnected)(AudioSessionDisconnectReason) override {
        *dead_ = AUDCLNT_E_DEVICE_INVALIDATED;
        return S_OK;
    }

private:
    std::atomic<HRESULT>* dead_;
};

HRESULT ActivateProcessLoopback(DWORD pid, ComPtr<IAudioClient>& client) {
    AUDIOCLIENT_ACTIVATION_PARAMS params{};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = pid;
    params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
    PROPVARIANT pv{};
    pv.vt = VT_BLOB;
    pv.blob.cbSize = sizeof(params);
    pv.blob.pBlobData = reinterpret_cast<BYTE*>(&params);
    auto handler = Microsoft::WRL::Make<ActivationHandler>();
    ComPtr<IActivateAudioInterfaceAsyncOperation> op;
    HRESULT hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                                             __uuidof(IAudioClient), &pv, handler.Get(), &op);
    if (FAILED(hr)) return hr;
    // Bounded: this call can hang while the audio service restarts.
    if (WaitForSingleObject(handler->done, 2000) != WAIT_OBJECT_0)
        return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    if (FAILED(handler->result)) return handler->result;
    client = handler->client;
    return S_OK;
}

std::string PropertyString(IPropertyStore* props, const PROPERTYKEY& key) {
    PROPVARIANT v;
    PropVariantInit(&v);
    std::string r;
    if (SUCCEEDED(props->GetValue(key, &v)) && v.vt == VT_LPWSTR) r = Narrow(v.pwszVal);
    PropVariantClear(&v);
    return r;
}

DeviceInfo DescribeDevice(IMMDevice* device) {
    DeviceInfo info;
    LPWSTR id = nullptr;
    if (SUCCEEDED(device->GetId(&id))) {
        info.id = Narrow(id);
        CoTaskMemFree(id);
    }
    ComPtr<IPropertyStore> props;
    if (SUCCEEDED(device->OpenPropertyStore(STGM_READ, &props))) {
        info.name = PropertyString(props.Get(), PKEY_Device_FriendlyName);
        std::string e = PropertyString(props.Get(), PKEY_Device_EnumeratorName);
        if (e == "BTHHFENUM" || e == "BTHENUM") info.transport = "bluetooth-handsfree";
        else if (e == "USB") info.transport = "usb";
        else if (e == "HDAUDIO" || e == "INTELAUDIO") info.transport = "internal";
        else info.transport = "other:" + e;
    }
    return info;
}

HRESULT GetDevice(EDataFlow flow, ERole role, const std::wstring& id, ComPtr<IMMDevice>& device) {
    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) return hr;
    return id.empty() ? enumerator->GetDefaultAudioEndpoint(flow, role, &device)
                      : enumerator->GetDevice(id.c_str(), &device);
}

// The names the app knows; see HelperMic in packages/capture/src/index.ts.
std::string ContractTransport(const std::string& transport) {
    if (transport == "internal") return "builtIn";
    if (transport == "usb") return "usb";
    if (transport == "bluetooth-handsfree") return "bluetoothHandsFree";
    return "other";
}

std::wstring ImagePath(DWORD pid, FILETIME* created) {
    std::wstring path;
    if (HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid)) {
        wchar_t buf[MAX_PATH * 2];
        DWORD size = ARRAYSIZE(buf);
        FILETIME a, b, c;
        if (QueryFullProcessImageNameW(h, 0, buf, &size) && GetProcessTimes(h, created, &a, &b, &c)) path = buf;
        CloseHandle(h);
    }
    return path;
}

bool InWindowsFolder(const std::wstring& path) {
    wchar_t dir[MAX_PATH];
    UINT n = GetWindowsDirectoryW(dir, MAX_PATH);
    return n && _wcsnicmp(path.c_str(), dir, n) == 0;
}

// Climbs to the top of the app's own processes.  Windows itself ends the climb, and
// so does a parent newer than its child, which means a reused PID.
DWORD AppRoot(DWORD pid, const std::map<DWORD, DWORD>& parents) {
    FILETIME created{};
    ImagePath(pid, &created);
    for (int depth = 0; depth < 32; ++depth) {
        auto it = parents.find(pid);
        if (it == parents.end() || !it->second) break;
        FILETIME parentCreated{};
        std::wstring path = ImagePath(it->second, &parentCreated);
        if (path.empty() || InWindowsFolder(path) || CompareFileTime(&parentCreated, &created) > 0) break;
        pid = it->second;
        created = parentCreated;
    }
    return pid;
}

std::map<DWORD, DWORD> ProcessParents() {
    std::map<DWORD, DWORD> parents;
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return parents;
    PROCESSENTRY32W e{};
    e.dwSize = sizeof e;
    for (BOOL more = Process32FirstW(snapshot, &e); more; more = Process32NextW(snapshot, &e))
        parents[e.th32ProcessID] = e.th32ParentProcessID;
    CloseHandle(snapshot);
    return parents;
}

std::set<DWORD> AudioSessionPids() {
    std::set<DWORD> pids;
    ComPtr<IMMDeviceEnumerator> enumerator;
    ComPtr<IMMDeviceCollection> all;
    UINT count = 0;
    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator))) ||
        FAILED(enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &all)))
        return pids;
    all->GetCount(&count);
    for (UINT i = 0; i < count; ++i) {
        ComPtr<IMMDevice> device;
        ComPtr<IAudioSessionManager2> manager;
        ComPtr<IAudioSessionEnumerator> sessions;
        int total = 0;
        if (FAILED(all->Item(i, &device)) ||
            FAILED(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr, &manager)) ||
            FAILED(manager->GetSessionEnumerator(&sessions)) || FAILED(sessions->GetCount(&total)))
            continue;
        for (int s = 0; s < total; ++s) {
            ComPtr<IAudioSessionControl> control;
            ComPtr<IAudioSessionControl2> control2;
            AudioSessionState state;
            DWORD pid = 0;
            if (SUCCEEDED(sessions->GetSession(s, &control)) && SUCCEEDED(control.As(&control2)) &&
                control2->IsSystemSoundsSession() != S_OK && SUCCEEDED(control2->GetState(&state)) &&
                state != AudioSessionStateExpired && SUCCEEDED(control2->GetProcessId(&pid)) && pid)
                pids.insert(pid);
        }
    }
    return pids;
}

std::string FileStem(const std::string& file) { return file.substr(0, file.rfind('.')); }

// The name Task Manager shows, or the file's own name.
std::string AppName(const std::wstring& path, const std::string& file) {
    DWORD ignored = 0;
    std::vector<BYTE> data(GetFileVersionInfoSizeW(path.c_str(), &ignored));
    struct Language { WORD language, codePage; }* languages = nullptr;
    wchar_t* description = nullptr;
    UINT size = 0;
    if (!data.empty() && GetFileVersionInfoW(path.c_str(), 0, static_cast<DWORD>(data.size()), data.data()) &&
        VerQueryValueW(data.data(), L"\\VarFileInfo\\Translation", reinterpret_cast<void**>(&languages), &size) && size) {
        wchar_t key[64];
        swprintf(key, 64, L"\\StringFileInfo\\%04x%04x\\FileDescription", languages->language, languages->codePage);
        if (VerQueryValueW(data.data(), key, reinterpret_cast<void**>(&description), &size) && size > 1)
            return Narrow(description);
    }
    return FileStem(file);
}

bool ResolveId(EDataFlow flow, ERole role, std::wstring* id) {
    ComPtr<IMMDevice> device;
    if (FAILED(GetDevice(flow, role, L"", device))) return false;
    LPWSTR raw = nullptr;
    if (FAILED(device->GetId(&raw))) return false;
    *id = raw;
    CoTaskMemFree(raw);
    return true;
}

}  // namespace

int64_t NowNs() {
    LARGE_INTEGER q;
    QueryPerformanceCounter(&q);
    int64_t f = QpcFrequency();
    return q.QuadPart / f * kNsPerSec + (q.QuadPart % f) * kNsPerSec / f;
}

void ReadWall(std::string* utc, int64_t* wallNs) {
    FILETIME ft;
    GetSystemTimePreciseAsFileTime(&ft);
    ULARGE_INTEGER u;
    u.LowPart = ft.dwLowDateTime;
    u.HighPart = ft.dwHighDateTime;
    *wallNs = static_cast<int64_t>(u.QuadPart - 116444736000000000ULL) * 100;
    SYSTEMTIME st;
    FileTimeToSystemTime(&ft, &st);
    char buf[40];
    snprintf(buf, sizeof buf, "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", st.wYear, st.wMonth, st.wDay,
             st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
    *utc = buf;
}

bool ResolveDefaultMicId(std::wstring* id) { return ResolveId(eCapture, eConsole, id); }
bool ResolveDefaultOutputId(std::wstring* id) { return ResolveId(eRender, eConsole, id); }

std::string ListMicsJson() {
    std::string out = "[";
    ComPtr<IMMDeviceEnumerator> enumerator;
    ComPtr<IMMDeviceCollection> all;
    UINT count = 0;
    if (SUCCEEDED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator))) &&
        SUCCEEDED(enumerator->EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE, &all))) {
        all->GetCount(&count);
    }
    std::wstring console, comms;
    ResolveId(eCapture, eConsole, &console);
    ResolveId(eCapture, eCommunications, &comms);
    for (UINT i = 0; i < count; ++i) {
        ComPtr<IMMDevice> d;
        if (FAILED(all->Item(i, &d))) continue;
        DeviceInfo info = DescribeDevice(d.Get());
        if (out.size() > 1) out += ",";
        out += JsonObject().Str("id", info.id).Str("name", info.name)
                   .Str("transport", ContractTransport(info.transport))
                   .Bool("isSystemDefault", info.id == Narrow(console))
                   .Bool("defaultConsole", info.id == Narrow(console))
                   .Bool("defaultCommunications", info.id == Narrow(comms)).Done();
    }
    return out + "]";
}

std::string ListAppsJson(const std::vector<std::string>& include) {
    struct App { std::string name; std::set<DWORD> pids; };
    std::map<std::string, App> apps;
    auto parents = ProcessParents();
    DWORD own = AppRoot(GetCurrentProcessId(), parents);
    for (DWORD pid : AudioSessionPids()) {
        DWORD root = AppRoot(pid, parents);
        FILETIME created{};
        std::wstring path = ImagePath(root, &created);
        if (root == own || path.empty() || InWindowsFolder(path)) continue;
        std::string file = Narrow(path.substr(path.find_last_of(L'\\') + 1));
        App& app = apps[file];
        if (app.name.empty()) app.name = AppName(path, file);
        app.pids.insert(root);
    }
    std::string out = "[";
    auto add = [&out](const std::string& id, const App& app) {
        std::string pids = "[";
        for (DWORD pid : app.pids) pids += (pids.size() > 1 ? "," : "") + std::to_string(pid);
        if (out.size() > 1) out += ",";
        out += JsonObject().Str("bundleId", id).Str("name", app.name).Bool("running", !app.pids.empty())
                   .Raw("pids", pids + "]").Done();
    };
    for (const auto& [id, app] : apps) add(id, app);
    for (const auto& id : include)
        if (!apps.count(id)) add(id, App{FileStem(id), {}});
    return out + "]";
}

Track::Track(PipelineConfig config, const std::wstring& dir, const Gate& gate, EventFn emit, bool continuing)
    : gate_(gate), store_(dir, continuing),
      pipeline_(std::make_unique<TrackPipeline>(std::move(config), store_, std::move(emit))) {
    event_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    writer_ = std::thread([this] { WriterLoop(); });
}

Track::~Track() {
    CloseStream();
    {
        std::lock_guard<std::mutex> lock(mutex_);
        writerStop_ = true;
    }
    cv_.notify_all();
    writer_.join();
    CloseHandle(event_);
}

HRESULT Track::OpenStream(const StreamSpec& spec, DeviceInfo* info) {
    CloseStream();
    ComPtr<IAudioClient> client;
    ComPtr<IMMDevice> device;
    DeviceInfo described;
    HRESULT hr = S_OK;
    bool loopback = spec.kind != StreamSpec::Kind::Mic;
    if (spec.kind == StreamSpec::Kind::Process) {
        hr = ActivateProcessLoopback(spec.pid, client);
        described = {"process:" + std::to_string(spec.pid), "Process tree " + std::to_string(spec.pid), "loopback"};
    } else {
        // Owner decision on Q10: eConsole is the Input choice in Settings;
        // eCommunications ignores it and moves when a headset connects.
        hr = spec.kind == StreamSpec::Kind::Mic ? GetDevice(eCapture, eConsole, spec.deviceId, device)
                                                : GetDevice(eRender, eConsole, L"", device);
        if (SUCCEEDED(hr)) hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &client);
        if (SUCCEEDED(hr)) described = DescribeDevice(device.Get());
        if (spec.kind == StreamSpec::Kind::System) described.transport = "loopback";
    }
    if (FAILED(hr)) return hr;

    WAVEFORMATEX format = MakeFormat();
    DWORD flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                  AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    if (loopback) flags |= AUDCLNT_STREAMFLAGS_LOOPBACK;
    // Process loopback requires a zero duration.
    REFERENCE_TIME duration = spec.kind == StreamSpec::Kind::Process ? 0 : kMicBuffer;
    hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, duration, 0, &format, nullptr);
    if (FAILED(hr)) return hr;
    hr = client->SetEventHandle(event_);
    if (FAILED(hr)) return hr;
    ComPtr<IAudioCaptureClient> captureClient;
    hr = client->GetService(IID_PPV_ARGS(&captureClient));
    if (FAILED(hr)) return hr;

    if (spec.kind == StreamSpec::Kind::Mic &&
        SUCCEEDED(client->GetService(IID_PPV_ARGS(&sessionControl_)))) {
        sessionEvents_ = Microsoft::WRL::Make<SessionWatcher>(&deadHr);
        sessionControl_->RegisterAudioSessionNotification(sessionEvents_.Get());
    }
    if (spec.kind == StreamSpec::Kind::System) {
        // Endpoint loopback delivers nothing while no client renders.
        ComPtr<IAudioClient> render;
        WAVEFORMATEX* mix = nullptr;
        if (SUCCEEDED(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &render)) &&
            SUCCEEDED(render->GetMixFormat(&mix)) &&
            SUCCEEDED(render->Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 10000000, 0, mix, nullptr)) &&
            SUCCEEDED(render->GetBufferSize(&renderBufferFrames_)) &&
            SUCCEEDED(render->GetService(IID_PPV_ARGS(&renderService_)))) {
            renderClient_ = render;
            TopUpRender();
            renderClient_->Start();
        }
        if (mix) CoTaskMemFree(mix);
    }
    hr = client->Start();
    if (FAILED(hr)) {
        sessionControl_.Reset();
        return hr;
    }
    client_ = client;
    captureClient_ = captureClient;
    deadHr = S_OK;
    lastArrivalNs = NowNs();
    captureStop_ = false;
    openDevice_ = described;
    streamOpen_ = true;
    capture_ = std::thread([this] { CaptureLoop(); });
    if (info) *info = described;
    return S_OK;
}

void Track::CloseStream() {
    captureStop_ = true;
    if (capture_.joinable()) capture_.join();
    if (client_) client_->Stop();
    if (renderClient_) renderClient_->Stop();
    if (sessionControl_ && sessionEvents_) sessionControl_->UnregisterAudioSessionNotification(sessionEvents_.Get());
    sessionControl_.Reset();
    sessionEvents_.Reset();
    captureClient_.Reset();
    client_.Reset();
    renderService_.Reset();
    renderClient_.Reset();
    streamOpen_ = false;
}

void Track::TopUpRender() {
    UINT32 padding = 0;
    if (FAILED(renderClient_->GetCurrentPadding(&padding))) return;
    UINT32 free = renderBufferFrames_ - padding;
    BYTE* data = nullptr;
    if (free && SUCCEEDED(renderService_->GetBuffer(free, &data)))
        renderService_->ReleaseBuffer(free, AUDCLNT_BUFFERFLAGS_SILENT);
}

void Track::CaptureLoop() {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    DWORD taskIndex = 0;
    HANDLE task = AvSetMmThreadCharacteristicsW(L"Audio", &taskIndex);
    while (!captureStop_) {
        WaitForSingleObject(event_, 100);
        if (renderClient_) TopUpRender();
        if (NowNs() < hooks.stallUntilNs) continue;
        UINT32 next = 0;
        HRESULT hr;
        while (SUCCEEDED(hr = captureClient_->GetNextPacketSize(&next)) && next) {
            BYTE* data = nullptr;
            UINT32 frames = 0;
            DWORD flags = 0;
            UINT64 position = 0, qpc = 0;
            hr = captureClient_->GetBuffer(&data, &frames, &flags, &position, &qpc);
            if (FAILED(hr)) break;
            int64_t arrival = NowNs();
            bool stampOk = qpc && !(flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR);
            int64_t stampNs = (stampOk ? static_cast<int64_t>(qpc) * 100 : arrival) - hooks.stampSkewNs;
            bool silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;
            if (hooks.blackhole) {
                captureClient_->ReleaseBuffer(frames);
                continue;
            }
            lastArrivalNs = arrival;
            const auto* samples = reinterpret_cast<const int16_t*>(data);
            double sum = 0;
            for (UINT32 i = 0; !silent && i < frames; ++i) sum += static_cast<double>(samples[i]) * samples[i];
            double rms = frames ? std::sqrt(sum / frames) : 0;
            double db = rms > 0 ? 20 * std::log10(rms / 32768.0) : -120.0;
            levelCentiDb = static_cast<int>((std::max)(db, -120.0) * 100);

            // Nothing past here exists for a closed gate.  Loopback stamps can lag real
            // time (F3), so the pipeline's correction counts, or late sound could pass.
            if (!gate_.Passes(stampNs + pipeline_->stats().correctionNs, FramesToNs(frames))) {
                captureClient_->ReleaseBuffer(frames);
                continue;
            }
            auto p = std::make_unique<Packet>();
            p->stampNs = stampNs;
            p->arrivalNs = arrival;
            p->generation = gate_.Generation();
            p->frames = frames;
            p->flagDiscontinuity = (flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) != 0;
            p->silentFlag = silent;
            p->pcm.assign(frames, 0);
            if (!silent) memcpy(p->pcm.data(), data, frames * sizeof(int16_t));
            captureClient_->ReleaseBuffer(frames);
            Item item;
            item.packet = std::move(p);
            Enqueue(std::move(item));
        }
        if (FAILED(hr)) {
            deadHr = hr;
            break;
        }
    }
    if (task) AvRevertMmThreadCharacteristics(task);
    CoUninitialize();
}

void Track::Enqueue(Item item) {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (item.packet && queue_.size() >= kMaxQueuedPackets) return;
        queue_.push_back(std::move(item));
    }
    cv_.notify_one();
}

void Track::Post(std::function<void(TrackPipeline&)> fn) {
    Item item;
    item.call = std::move(fn);
    Enqueue(std::move(item));
}

bool Track::PostAndWait(std::function<void(TrackPipeline&)> fn, DWORD timeoutMs) {
    auto done = std::shared_ptr<void>(CreateEventW(nullptr, TRUE, FALSE, nullptr), CloseHandle);
    Post([fn = std::move(fn), done](TrackPipeline& p) {
        fn(p);
        SetEvent(done.get());
    });
    return WaitForSingleObject(done.get(), timeoutMs) == WAIT_OBJECT_0;
}

void Track::WriterLoop() {
    for (;;) {
        Item item;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait_for(lock, std::chrono::milliseconds(20), [this] { return writerStop_ || !queue_.empty(); });
            if (queue_.empty()) {
                if (writerStop_) return;
                lock.unlock();
                if (!gate_.IsOpen() && !stopping) pipeline_->OnGateClosed();
                continue;
            }
            item = std::move(queue_.front());
            queue_.pop_front();
        }
        if (item.packet) pipeline_->OnPacket(*item.packet);
        else item.call(*pipeline_);
    }
}

}  // namespace scrb
