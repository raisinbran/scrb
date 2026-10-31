#define _CRT_SECURE_NO_WARNINGS
#include "MicProbe.h"

#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>
#include <algorithm>
#include <cmath>
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <thread>

using Microsoft::WRL::ComPtr;

namespace scrb {
namespace {

std::string Field(const Command& command, const std::string& key,
                  const std::string& fallback = "") {
    auto it = command.find(key);
    return it == command.end() ? fallback : it->second;
}

std::wstring Wide(const std::string& value) {
    if (value.empty()) return L"";
    int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.c_str(), -1, nullptr, 0);
    if (!count) return L"";
    std::wstring result(static_cast<size_t>(count), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.c_str(), -1, result.data(), count);
    result.pop_back();
    return result;
}

class MicReader {
public:
    bool Open(const std::string& selected) {
        Close();
        ComPtr<IMMDeviceEnumerator> devices;
        if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                    IID_PPV_ARGS(&devices)))) return false;
        ComPtr<IMMDevice> device;
        HRESULT hr = selected == "default"
            ? devices->GetDefaultAudioEndpoint(eCapture, eConsole, &device)
            : devices->GetDevice(Wide(selected).c_str(), &device);
        if (FAILED(hr)) return false;

        ComPtr<IAudioClient> client;
        hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &client);
        if (FAILED(hr)) return false;
        WAVEFORMATEX format{};
        format.wFormatTag = WAVE_FORMAT_PCM;
        format.nChannels = 1;
        format.nSamplesPerSec = 48000;
        format.wBitsPerSample = 16;
        format.nBlockAlign = 2;
        format.nAvgBytesPerSec = 96000;
        hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
            2000000, 0, &format, nullptr);
        if (FAILED(hr)) return false;
        ComPtr<IAudioCaptureClient> capture;
        hr = client->GetService(IID_PPV_ARGS(&capture));
        if (FAILED(hr) || FAILED(client->Start())) return false;
        client_ = client;
        capture_ = capture;
        started_ = GetTickCount64();
        return true;
    }

    double Level() {
        if (!capture_) return -100;
        UINT32 count = 0;
        double peak = 0;
        while (SUCCEEDED(capture_->GetNextPacketSize(&count)) && count) {
            BYTE* data = nullptr;
            UINT32 frames = 0;
            DWORD flags = 0;
            if (FAILED(capture_->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) {
                Close();
                return -100;
            }
            if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT) && data) {
                const auto* samples = reinterpret_cast<const int16_t*>(data);
                for (UINT32 i = 0; i < frames; ++i)
                    peak = (std::max)(peak, std::abs(static_cast<double>(samples[i])) / 32768.0);
            }
            capture_->ReleaseBuffer(frames);
        }
        return peak > 0 ? 20 * std::log10(peak) : -100;
    }

    bool IsOpen() const { return client_ != nullptr; }
    bool Expired() const { return started_ && GetTickCount64() - started_ >= 120000; }
    void Close() {
        if (client_) client_->Stop();
        capture_.Reset();
        client_.Reset();
        started_ = 0;
    }
    ~MicReader() { Close(); }

private:
    ComPtr<IAudioClient> client_;
    ComPtr<IAudioCaptureClient> capture_;
    ULONGLONG started_ = 0;
};

void Ack(const std::string& id, bool ok, bool active) {
    std::cout << JsonObject().Str("type", "ack").Str("id", id).Bool("ok", ok)
                     .Str("gate", "closed").Raw("atNs", "null")
                     .Raw("activeTracks", active ? "[\"microphone\"]" : "[]").Done() << std::endl;
}
}  // namespace

int RunMicProbe(const std::function<Command(const std::string&)>& parse) {
    std::mutex guard;
    std::deque<Command> queue;
    std::atomic<bool> inputClosed{false};
    std::thread([&] {
        std::string line;
        while (std::getline(std::cin, line)) {
            std::lock_guard<std::mutex> lock(guard);
            queue.push_back(parse(line));
        }
        inputClosed = true;
    }).detach();

    MicReader mic;
    bool finished = false;
    while (!finished) {
        std::deque<Command> pending;
        {
            std::lock_guard<std::mutex> lock(guard);
            pending.swap(queue);
        }
        for (const auto& command : pending) {
            const std::string name = Field(command, "name");
            const std::string id = Field(command, "id");
            if (name == "beginMicCheck") {
                const bool ok = mic.IsOpen() || mic.Open(Field(command, "mic", "default"));
                Ack(id, ok, ok);
            } else if (name == "endMicCheck") {
                mic.Close();
                Ack(id, true, false);
                finished = true;
            } else {
                Ack(id, false, mic.IsOpen());
            }
        }
        if (inputClosed) finished = true;
        if (mic.IsOpen() && !finished) {
            if (mic.Expired()) {
                finished = true;
            } else {
                std::cout << JsonObject().Str("type", "event").Str("event", "micLevel")
                                 .Num("micDb", mic.Level()).Done() << std::endl;
            }
        }
        Sleep(100);
    }
    mic.Close();
    return 0;
}

}  // namespace scrb
