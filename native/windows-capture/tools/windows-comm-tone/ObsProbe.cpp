// Process loopback set up field for field as OBS win-wasapi.cpp InitClient does. Prints peak dBFS per second.
// Usage: ObsProbe <pid> <seconds>
#include <Windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <ksmedia.h>
#include <wrl/client.h>
#include <wrl/implements.h>
#include <cmath>
#include <cstdio>
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "mmdevapi.lib")
using Microsoft::WRL::ComPtr;
#define CHECK(x) do { HRESULT h_ = (x); if (FAILED(h_)) { printf(#x " failed %08lx\n", (unsigned long)h_); return 1; } } while (0)
class Handler : public Microsoft::WRL::RuntimeClass<Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
    Microsoft::WRL::FtmBase, IActivateAudioInterfaceCompletionHandler> {
public:
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HRESULT result = E_FAIL;
    ComPtr<IAudioClient> client;
    STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* op) override {
        ComPtr<IUnknown> unk;
        HRESULT hr = E_FAIL;
        op->GetActivateResult(&hr, &unk);
        if (SUCCEEDED(hr)) unk.As(&client);
        result = hr;
        SetEvent(done);
        return S_OK;
    }
};
int wmain(int argc, wchar_t** argv) {
    DWORD pid = _wtoi(argv[1]);
    int seconds = _wtoi(argv[2]);
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    WAVEFORMATEXTENSIBLE fx{};
    WAVEFORMATEX& wf = fx.Format;
    wf.wFormatTag = WAVE_FORMAT_EXTENSIBLE;
    wf.nChannels = 2;
    wf.nSamplesPerSec = 48000;
    wf.wBitsPerSample = 32;
    wf.nBlockAlign = 8;
    wf.nAvgBytesPerSec = 48000 * 8;
    wf.cbSize = sizeof fx - sizeof wf;
    fx.Samples.wValidBitsPerSample = 32;
    fx.dwChannelMask = SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT;
    fx.SubFormat = KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
    AUDIOCLIENT_ACTIVATION_PARAMS params{};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = pid;
    params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
    PROPVARIANT pv{};
    pv.vt = VT_BLOB;
    pv.blob.cbSize = sizeof params;
    pv.blob.pBlobData = reinterpret_cast<BYTE*>(&params);
    auto handler = Microsoft::WRL::Make<Handler>();
    ComPtr<IActivateAudioInterfaceAsyncOperation> op;
    CHECK(ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &pv, handler.Get(), &op));
    WaitForSingleObject(handler->done, 3000);
    CHECK(handler->result);
    ComPtr<IAudioClient> client = handler->client;
    CHECK(client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_LOOPBACK,
                             5 * 10000000, 0, &wf, nullptr));
    HANDLE ev = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    CHECK(client->SetEventHandle(ev));
    ComPtr<IAudioCaptureClient> capture;
    CHECK(client->GetService(IID_PPV_ARGS(&capture)));
    CHECK(client->Start());
    for (int s = 0; s < seconds; ++s) {
        float peak = 0;
        ULONGLONG frames = 0, end = GetTickCount64() + 1000;
        while (GetTickCount64() < end) {
            WaitForSingleObject(ev, 100);
            UINT32 size = 0;
            while (SUCCEEDED(capture->GetNextPacketSize(&size)) && size) {
                BYTE* data; UINT32 n; DWORD flags;
                if (FAILED(capture->GetBuffer(&data, &n, &flags, nullptr, nullptr))) break;
                if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT)) {
                    auto* f = reinterpret_cast<float*>(data);
                    for (UINT32 i = 0; i < n * 2; ++i) if (fabsf(f[i]) > peak) peak = fabsf(f[i]);
                }
                frames += n;
                capture->ReleaseBuffer(n);
            }
        }
        printf("%d: frames %llu peak %.1f dB\n", s, frames, peak > 0 ? 20 * log10(peak) : -999.0);
    }
    client->Stop();
    return 0;
}
