#include <Windows.h>
#include <mmsystem.h>

#include <cmath>
#include <cstdint>
#include <iostream>
#include <vector>

#pragma comment(lib, "winmm.lib")

int wmain(int argc, wchar_t** argv) {
    const int frequency = argc > 1 ? _wtoi(argv[1]) : 880;
    const int durationSeconds = argc > 2 ? _wtoi(argv[2]) : 14;
    const int delaySeconds = argc > 3 ? _wtoi(argv[3]) : 2;
    constexpr int sampleRate = 48000;
    constexpr double pi = 3.14159265358979323846;

    std::vector<std::int16_t> samples(sampleRate * durationSeconds);
    for (std::size_t i = 0; i < samples.size(); ++i) {
        const double seconds = static_cast<double>(i) / sampleRate;
        const double pulsePosition = std::fmod(seconds, 1.0);
        const double amplitude = pulsePosition < 0.1 ? 0.65 : 0.18;
        samples[i] = static_cast<std::int16_t>(
            amplitude * INT16_MAX * std::sin(2.0 * pi * frequency * seconds));
    }

    WAVEFORMATEX format{};
    format.wFormatTag = WAVE_FORMAT_PCM;
    format.nChannels = 1;
    format.nSamplesPerSec = sampleRate;
    format.wBitsPerSample = 16;
    format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
    format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

    HWAVEOUT output = nullptr;
    const MMRESULT openResult = waveOutOpen(
        &output, WAVE_MAPPER, &format, 0, 0, CALLBACK_NULL);
    if (openResult != MMSYSERR_NOERROR) {
        std::wcerr << L"waveOutOpen failed: " << openResult << L'\n';
        return 1;
    }

    WAVEHDR header{};
    header.lpData = reinterpret_cast<LPSTR>(samples.data());
    header.dwBufferLength = static_cast<DWORD>(samples.size() * sizeof(samples[0]));
    if (waveOutPrepareHeader(output, &header, sizeof(header)) != MMSYSERR_NOERROR) {
        waveOutClose(output);
        return 2;
    }

    Sleep(delaySeconds * 1000);
    if (waveOutWrite(output, &header, sizeof(header)) != MMSYSERR_NOERROR) {
        waveOutUnprepareHeader(output, &header, sizeof(header));
        waveOutClose(output);
        return 3;
    }
    while ((header.dwFlags & WHDR_DONE) == 0) {
        Sleep(20);
    }

    waveOutUnprepareHeader(output, &header, sizeof(header));
    waveOutClose(output);
    return 0;
}

