// Phase 0 throwaway probe: capture one process tree (process loopback) and the
// default communications microphone in one process, writing two WAV files and a
// per-packet timing log against QueryPerformanceCounter.  Used to measure clock
// drift between the tracks, discontinuities, and CPU cost over long runs.
//
// Usage: DualCapture.exe <pid> <out-prefix> <seconds> [mic|nomic]
// Outputs: <prefix>-app.wav, <prefix>-mic.wav, <prefix>-timing.csv,
//          <prefix>-summary.json

#define _CRT_SECURE_NO_WARNINGS
#include <Windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <mmreg.h>
#include <avrt.h>
#include <psapi.h>
#include <wrl/implements.h>

#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#pragma comment(lib, "mmdevapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "avrt.lib")

using Microsoft::WRL::ComPtr;

namespace {

constexpr UINT32 kSampleRate = 48000;
constexpr WORD kChannels = 1;
constexpr WORD kBits = 16;

LARGE_INTEGER g_qpcFrequency;
std::atomic<bool> g_stop{false};
std::mutex g_logMutex;
FILE* g_timing = nullptr;

double QpcToSeconds(UINT64 qpc) {
    return static_cast<double>(qpc) / g_qpcFrequency.QuadPart;
}

UINT64 NowQpc() {
    LARGE_INTEGER now;
    QueryPerformanceCounter(&now);
    return static_cast<UINT64>(now.QuadPart);
}

WAVEFORMATEX MakeFormat() {
    WAVEFORMATEX f{};
    f.wFormatTag = WAVE_FORMAT_PCM;
    f.nChannels = kChannels;
    f.nSamplesPerSec = kSampleRate;
    f.wBitsPerSample = kBits;
    f.nBlockAlign = kChannels * kBits / 8;
    f.nAvgBytesPerSec = kSampleRate * f.nBlockAlign;
    return f;
}

class WavWriter {
public:
    bool Open(const std::wstring& path) {
        file_ = _wfopen(path.c_str(), L"wb");
        if (!file_) return false;
        std::vector<char> header(44, 0);
        fwrite(header.data(), 1, header.size(), file_);
        return true;
    }
    void Write(const BYTE* data, UINT32 bytes) {
        fwrite(data, 1, bytes, file_);
        dataBytes_ += bytes;
    }
    void WriteSilence(UINT32 bytes) {
        std::vector<BYTE> zeros(bytes, 0);
        Write(zeros.data(), bytes);
    }
    void Close() {
        if (!file_) return;
        WAVEFORMATEX f = MakeFormat();
        UINT32 riffSize = 36 + dataBytes_;
        UINT32 fmtSize = 16;
        fseek(file_, 0, SEEK_SET);
        fwrite("RIFF", 1, 4, file_);
        fwrite(&riffSize, 4, 1, file_);
        fwrite("WAVEfmt ", 1, 8, file_);
        fwrite(&fmtSize, 4, 1, file_);
        fwrite(&f, 1, 16, file_);
        fwrite("data", 1, 4, file_);
        fwrite(&dataBytes_, 4, 1, file_);
        fclose(file_);
        file_ = nullptr;
    }
private:
    FILE* file_ = nullptr;
    UINT32 dataBytes_ = 0;
};

class ActivationHandler
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
          Microsoft::WRL::FtmBase, IActivateAudioInterfaceCompletionHandler> {
public:
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HRESULT result = E_FAIL;
    ComPtr<IAudioClient> client;
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

HRESULT ActivateProcessLoopback(DWORD pid, ComPtr<IAudioClient>& client) {
    AUDIOCLIENT_ACTIVATION_PARAMS params{};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = pid;
    params.ProcessLoopbackParams.ProcessLoopbackMode =
        PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
    PROPVARIANT pv{};
    pv.vt = VT_BLOB;
    pv.blob.cbSize = sizeof(params);
    pv.blob.pBlobData = reinterpret_cast<BYTE*>(&params);
    auto handler = Microsoft::WRL::Make<ActivationHandler>();
    ComPtr<IActivateAudioInterfaceAsyncOperation> op;
    HRESULT hr = ActivateAudioInterfaceAsync(
        VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &pv,
        handler.Get(), &op);
    if (FAILED(hr)) return hr;
    WaitForSingleObject(handler->done, INFINITE);
    if (FAILED(handler->result)) return handler->result;
    client = handler->client;
    return S_OK;
}

HRESULT ActivateMicrophone(ComPtr<IAudioClient>& client) {
    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
                                  CLSCTX_ALL, IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) return hr;
    ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(eCapture, eCommunications, &device);
    if (FAILED(hr)) return hr;
    return device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &client);
}

struct TrackStats {
    const char* name;
    UINT64 frames = 0;            // frames written to the WAV (incl. inserted silence)
    UINT64 packets = 0;
    UINT64 discontinuities = 0;
    UINT64 silentFlagPackets = 0;
    UINT64 gapFillFrames = 0;     // silence inserted to cover detected gaps
    UINT64 firstQpc = 0;          // QPC of first captured frame
    UINT64 lastQpc = 0;           // QPC of first frame of the last packet
    UINT64 lastPacketFrames = 0;
    UINT64 nullQpcPackets = 0;
    double maxJitterMs = 0;       // |expected position - observed position|
    UINT64 firstArrival = 0;      // NowQpc() when the first packet was read
    UINT64 lastArrival = 0;       // NowQpc() when the last packet was read
    double maxInterArrivalMs = 0; // longest wait between packets
    HRESULT error = S_OK;
};

void RunTrack(ComPtr<IAudioClient> client, bool loopback, const std::wstring& path,
              TrackStats* stats, HANDLE startBarrier) {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    WAVEFORMATEX format = MakeFormat();
    DWORD flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                  AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                  AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    if (loopback) flags |= AUDCLNT_STREAMFLAGS_LOOPBACK;
    // Process loopback requires a zero duration; 200 ms buffer for the mic.
    REFERENCE_TIME duration = loopback ? 0 : 2000000;
    HRESULT hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, duration, 0,
                                    &format, nullptr);
    if (FAILED(hr)) { stats->error = hr; SetEvent(startBarrier); return; }
    HANDLE event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    client->SetEventHandle(event);
    ComPtr<IAudioCaptureClient> capture;
    hr = client->GetService(IID_PPV_ARGS(&capture));
    if (FAILED(hr)) { stats->error = hr; SetEvent(startBarrier); return; }

    WavWriter wav;
    if (!wav.Open(path)) { stats->error = E_ACCESSDENIED; SetEvent(startBarrier); return; }

    HANDLE mmcssTask = nullptr;
    DWORD taskIndex = 0;
    mmcssTask = AvSetMmThreadCharacteristicsW(L"Audio", &taskIndex);

    SetEvent(startBarrier);
    client->Start();
    UINT64 lastLogQpc = 0;
    while (!g_stop.load()) {
        if (WaitForSingleObject(event, 500) != WAIT_OBJECT_0) continue;
        UINT32 packetFrames = 0;
        while (SUCCEEDED(capture->GetNextPacketSize(&packetFrames)) && packetFrames) {
            BYTE* data = nullptr;
            UINT32 frames = 0;
            DWORD bufferFlags = 0;
            UINT64 devicePosition = 0, qpcPosition = 0;
            hr = capture->GetBuffer(&data, &frames, &bufferFlags, &devicePosition,
                                    &qpcPosition);
            if (FAILED(hr)) { stats->error = hr; break; }
            UINT64 arrival = NowQpc();
            if (stats->packets == 0) stats->firstArrival = arrival;
            else {
                double gapMs = QpcToSeconds(arrival - stats->lastArrival) * 1000.0;
                if (gapMs > stats->maxInterArrivalMs) stats->maxInterArrivalMs = gapMs;
            }
            // pu64QPCPosition is in 100 ns units.
            UINT64 qpc = qpcPosition
                ? static_cast<UINT64>(qpcPosition / 1e7 * g_qpcFrequency.QuadPart)
                : NowQpc();
            if (!qpcPosition) stats->nullQpcPackets++;
            if (stats->packets == 0) stats->firstQpc = qpc;

            // Expected position from QPC vs frames written so far.
            double elapsed = QpcToSeconds(qpc - stats->firstQpc);
            double expectedFrames = elapsed * kSampleRate;
            double behind = expectedFrames - static_cast<double>(stats->frames);
            if (bufferFlags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) {
                stats->discontinuities++;
                // Fill a detected gap with silence so the track stays on the clock.
                if (stats->packets > 0 && behind > kSampleRate * 0.010) {
                    UINT64 fill = static_cast<UINT64>(behind);
                    wav.WriteSilence(static_cast<UINT32>(fill * format.nBlockAlign));
                    stats->frames += fill;
                    stats->gapFillFrames += fill;
                    behind -= fill;
                }
            }
            double jitterMs = std::abs(behind) * 1000.0 / kSampleRate;
            if (stats->packets > 10 && jitterMs > stats->maxJitterMs)
                stats->maxJitterMs = jitterMs;

            UINT32 bytes = frames * format.nBlockAlign;
            if (bufferFlags & AUDCLNT_BUFFERFLAGS_SILENT) {
                stats->silentFlagPackets++;
                wav.WriteSilence(bytes);
            } else {
                wav.Write(data, bytes);
            }
            capture->ReleaseBuffer(frames);
            stats->lastQpc = qpc;
            stats->lastArrival = arrival;
            stats->lastPacketFrames = frames;
            stats->frames += frames;
            stats->packets++;

            if (QpcToSeconds(qpc - lastLogQpc) >= 1.0) {
                lastLogQpc = qpc;
                std::lock_guard<std::mutex> lock(g_logMutex);
                fprintf(g_timing, "%s,%.6f,%.6f,%llu,%llu,%.3f,%llu\n", stats->name,
                        QpcToSeconds(qpc), QpcToSeconds(arrival), stats->frames - frames, devicePosition,
                        behind * 1000.0 / kSampleRate, stats->discontinuities);
            }
        }
    }
    client->Stop();
    wav.Close();
    if (mmcssTask) AvRevertMmThreadCharacteristics(mmcssTask);
    CoUninitialize();
}

// Effective sample rate measured against QPC, from first to last packet.
double EffectiveRate(const TrackStats& s) {
    double seconds = QpcToSeconds(s.lastQpc - s.firstQpc);
    UINT64 frames = s.frames - s.lastPacketFrames;
    return seconds > 0 ? frames / seconds : 0;
}

// Same comparison as frame_vs_clock_error_ms, but against the time packets were
// read rather than the stream's own timestamps (includes up to ~one buffer of jitter).
double ArrivalError(const TrackStats& s) {
    double byFrames = static_cast<double>(s.frames - s.lastPacketFrames) / kSampleRate;
    return (byFrames - QpcToSeconds(s.lastArrival - s.firstArrival)) * 1000.0;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    if (argc < 4) {
        fwprintf(stderr, L"usage: DualCapture <pid> <out-prefix> <seconds> [mic|nomic]\n");
        return 2;
    }
    DWORD pid = static_cast<DWORD>(_wtoi(argv[1]));
    std::wstring prefix = argv[2];
    int seconds = _wtoi(argv[3]);
    bool useMic = argc < 5 || std::wstring(argv[4]) != L"nomic";
    QueryPerformanceFrequency(&g_qpcFrequency);
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    // Block idle sleep for the run, as a recorder must; manual sleep still applies.
    SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);

    g_timing = _wfopen((prefix + L"-timing.csv").c_str(), L"w");
    fprintf(g_timing, "track,qpc_s,arrival_s,frames_before_packet,device_position,behind_ms,discontinuities\n");

    ComPtr<IAudioClient> appClient, micClient;
    HRESULT hr = ActivateProcessLoopback(pid, appClient);
    if (FAILED(hr)) { fwprintf(stderr, L"process loopback activation failed 0x%08x\n", hr); return 1; }
    if (useMic) {
        hr = ActivateMicrophone(micClient);
        if (FAILED(hr)) { fwprintf(stderr, L"mic activation failed 0x%08x\n", hr); return 1; }
    }

    TrackStats appStats{"app"}, micStats{"mic"};
    HANDLE appReady = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HANDLE micReady = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    UINT64 startQpc = NowQpc();
    std::thread appThread(RunTrack, appClient, true, prefix + L"-app.wav", &appStats, appReady);
    std::thread micThread;
    if (useMic) micThread = std::thread(RunTrack, micClient, false, prefix + L"-mic.wav", &micStats, micReady);
    else SetEvent(micReady);

    HANDLE ready[] = {appReady, micReady};
    WaitForMultipleObjects(2, ready, TRUE, INFINITE);
    fwprintf(stdout, L"Capturing %d seconds.\n", seconds);
    fflush(stdout);
    // Sleep in slices so a progress line appears every minute.
    for (int elapsed = 0; elapsed < seconds; ++elapsed) {
        Sleep(1000);
        if ((elapsed + 1) % 60 == 0) {
            fwprintf(stdout, L"%d s app_frames=%llu mic_frames=%llu\n", elapsed + 1,
                     appStats.frames, micStats.frames);
            fflush(stdout);
            std::lock_guard<std::mutex> lock(g_logMutex);
            fflush(g_timing);
        }
    }
    g_stop = true;
    appThread.join();
    if (micThread.joinable()) micThread.join();
    UINT64 endQpc = NowQpc();
    fclose(g_timing);

    // Drift if the tracks were aligned by sample count alone, at the end of the run:
    // each track's (frames / nominal rate) minus its QPC-measured elapsed time.
    auto trackError = [](const TrackStats& s) {
        double byFrames = static_cast<double>(s.frames - s.lastPacketFrames) / kSampleRate;
        double byClock = QpcToSeconds(s.lastQpc - s.firstQpc);
        return (byFrames - byClock) * 1000.0;
    };
    double appErr = trackError(appStats);
    double micErr = useMic ? trackError(micStats) : 0;
    double startOffsetMs = useMic
        ? (QpcToSeconds(micStats.firstQpc) - QpcToSeconds(appStats.firstQpc)) * 1000.0 : 0;

    FILETIME c, e, k, u;
    GetProcessTimes(GetCurrentProcess(), &c, &e, &k, &u);
    auto ft = [](FILETIME f) { return (static_cast<UINT64>(f.dwHighDateTime) << 32 | f.dwLowDateTime) / 1e7; };
    double cpuSeconds = ft(k) + ft(u);
    double wall = QpcToSeconds(endQpc - startQpc);
    SYSTEM_INFO si; GetSystemInfo(&si);
    PROCESS_MEMORY_COUNTERS_EX pmc{};
    pmc.cb = sizeof(pmc);
    typedef BOOL(WINAPI * GetPmi)(HANDLE, PPROCESS_MEMORY_COUNTERS, DWORD);
    auto getPmi = reinterpret_cast<GetPmi>(GetProcAddress(LoadLibraryW(L"psapi.dll"), "GetProcessMemoryInfo"));
    if (getPmi) getPmi(GetCurrentProcess(), reinterpret_cast<PPROCESS_MEMORY_COUNTERS>(&pmc), sizeof(pmc));

    FILE* summary = _wfopen((prefix + L"-summary.json").c_str(), L"w");
    auto dumpTrack = [&](const TrackStats& s, double err, bool last) {
        fprintf(summary,
                "  \"%s\": {\"hresult\": \"0x%08lx\", \"packets\": %llu, \"frames\": %llu, "
                "\"seconds_by_frames\": %.6f, \"effective_rate_hz\": %.4f, "
                "\"frame_vs_clock_error_ms\": %.3f, \"discontinuities\": %llu, "
                "\"gap_fill_frames\": %llu, \"silent_flag_packets\": %llu, "
                "\"null_qpc_packets\": %llu, \"max_position_jitter_ms\": %.3f, "
                "\"arrival_error_ms\": %.3f, \"max_inter_arrival_ms\": %.3f}%s\n",
                s.name, static_cast<unsigned long>(s.error), s.packets, s.frames,
                static_cast<double>(s.frames) / kSampleRate, EffectiveRate(s), err,
                s.discontinuities, s.gapFillFrames, s.silentFlagPackets,
                s.nullQpcPackets, s.maxJitterMs, ArrivalError(s), s.maxInterArrivalMs,
                last ? "" : ",");
    };
    fprintf(summary, "{\n  \"requested_seconds\": %d,\n  \"wall_seconds\": %.3f,\n", seconds, wall);
    fprintf(summary, "  \"start_offset_ms\": %.3f,\n", startOffsetMs);
    fprintf(summary, "  \"sample_count_drift_ms\": %.3f,\n", appErr - micErr);
    fprintf(summary, "  \"arrival_drift_ms\": %.3f,\n",
            useMic ? ArrivalError(appStats) - ArrivalError(micStats) : 0.0);
    fprintf(summary, "  \"cpu_seconds\": %.3f,\n  \"avg_cpu_percent_of_machine\": %.4f,\n",
            cpuSeconds, 100.0 * cpuSeconds / (wall * si.dwNumberOfProcessors));
    fprintf(summary, "  \"peak_working_set_mib\": %.1f,\n", pmc.PeakWorkingSetSize / 1048576.0);
    dumpTrack(appStats, appErr, !useMic);
    if (useMic) dumpTrack(micStats, micErr, true);
    fprintf(summary, "}\n");
    fclose(summary);
    fwprintf(stdout, L"Finished. drift(sample-count)=%.3f ms\n", appErr - micErr);
    CoUninitialize();
    return (FAILED(appStats.error) || FAILED(micStats.error)) ? 1 : 0;
}
