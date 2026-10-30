// Mute.exe [on|off|status] : default render endpoint mute + volume.
#include <windows.h>
#include <mmdeviceapi.h>
#include <endpointvolume.h>
#include <functiondiscoverykeys_devpkey.h>
#include <cstdio>
#include <string>
#pragma comment(lib, "ole32.lib")
int wmain(int argc, wchar_t** argv) {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    IMMDeviceEnumerator* en = nullptr; IMMDevice* dev = nullptr; IAudioEndpointVolume* vol = nullptr; IPropertyStore* ps = nullptr;
    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&en)))) return 1;
    if (FAILED(en->GetDefaultAudioEndpoint(eRender, eConsole, &dev))) return 1;
    if (FAILED(dev->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, (void**)&vol))) return 1;
    std::wstring a = argc > 1 ? argv[1] : L"status";
    if (a == L"on") vol->SetMute(TRUE, nullptr); else if (a == L"off") vol->SetMute(FALSE, nullptr);
    BOOL m = FALSE; float lv = 0; vol->GetMute(&m); vol->GetMasterVolumeLevelScalar(&lv);
    PROPVARIANT pv; PropVariantInit(&pv);
    dev->OpenPropertyStore(STGM_READ, &ps); ps->GetValue(PKEY_Device_FriendlyName, &pv);
    wprintf(L"%s muted=%d volume=%.0f%%", pv.pwszVal, m, lv * 100);
    IMMDevice* mic = nullptr; IPropertyStore* mps = nullptr; PROPVARIANT mv; PropVariantInit(&mv);
    if (SUCCEEDED(en->GetDefaultAudioEndpoint(eCapture, eCommunications, &mic)) &&
        SUCCEEDED(mic->OpenPropertyStore(STGM_READ, &mps)) && SUCCEEDED(mps->GetValue(PKEY_Device_FriendlyName, &mv)))
        wprintf(L" | comms mic: %s", mv.pwszVal);
    wprintf(L"\n");
    return 0;
}
