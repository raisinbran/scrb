// Plays 880 Hz for N seconds through a shared stream with a chosen category and options.
// Usage: CommTone <seconds> <other|comms|speech|media> <raw|none> <console|comms>
#include <Windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <cmath>
#include <cstdio>
#include <cwchar>
#pragma comment(lib, "ole32.lib")
#define CHECK(x) do { HRESULT h_ = (x); if (FAILED(h_)) { printf(#x " failed %08lx\n", (unsigned long)h_); return 1; } } while (0)
int wmain(int argc, wchar_t** argv) {
    int seconds = argc > 1 ? _wtoi(argv[1]) : 10;
    AUDIO_STREAM_CATEGORY category = AudioCategory_Other;
    if (argc > 2 && !wcscmp(argv[2], L"comms")) category = AudioCategory_Communications;
    if (argc > 2 && !wcscmp(argv[2], L"speech")) category = AudioCategory_Speech;
    if (argc > 2 && !wcscmp(argv[2], L"media")) category = AudioCategory_Media;
    bool raw = argc > 3 && !wcscmp(argv[3], L"raw");
    ERole role = argc > 4 && !wcscmp(argv[4], L"comms") ? eCommunications : eConsole;
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    IMMDeviceEnumerator* en = nullptr;
    CHECK(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&en)));
    IMMDevice* dev = nullptr;
    CHECK(en->GetDefaultAudioEndpoint(eRender, role, &dev));
    IAudioClient2* client = nullptr;
    CHECK(dev->Activate(__uuidof(IAudioClient2), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&client)));
    AudioClientProperties props{};
    props.cbSize = sizeof props;
    props.eCategory = category;
    props.Options = raw ? AUDCLNT_STREAMOPTIONS_RAW : AUDCLNT_STREAMOPTIONS_NONE;
    CHECK(client->SetClientProperties(&props));
    WAVEFORMATEX* mix = nullptr;
    CHECK(client->GetMixFormat(&mix));
    CHECK(client->Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 1000000, 0, mix, nullptr));
    IAudioRenderClient* render = nullptr;
    CHECK(client->GetService(IID_PPV_ARGS(&render)));
    UINT32 size = 0;
    CHECK(client->GetBufferSize(&size));
    CHECK(client->Start());
    double phase = 0, step = 2 * 3.14159265358979 * 880 / mix->nSamplesPerSec;
    ULONGLONG end = GetTickCount64() + seconds * 1000ULL;
    while (GetTickCount64() < end) {
        Sleep(10);
        UINT32 pad = 0;
        client->GetCurrentPadding(&pad);
        UINT32 room = size - pad;
        BYTE* data = nullptr;
        if (!room || FAILED(render->GetBuffer(room, &data))) continue;
        auto* out = reinterpret_cast<float*>(data);  // the shared mix format is float
        for (UINT32 i = 0; i < room; ++i, phase += step)
            for (WORD c = 0; c < mix->nChannels; ++c) *out++ = static_cast<float>(0.3 * sin(phase));
        render->ReleaseBuffer(room, 0);
    }
    client->Stop();
    return 0;
}
