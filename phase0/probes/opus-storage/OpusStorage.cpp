// Phase 0 throwaway probe: Opus storage per hour and encoder CPU cost.
//
// Usage: OpusStorage <in.wav (16-bit PCM mono)> <bitrate_bps> [chunk_seconds]
// Encodes 20 ms frames (VOIP application, constrained VBR, complexity 10) and
// reports payload bytes, an Ogg container overhead estimate for chunk files
// with one page per second, MB per hour, and encode CPU as a fraction of one
// core and of the whole machine.

#include <opus.h>

#include <Windows.h>

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

int main(int argc, char** argv) {
    if (argc < 3) { fprintf(stderr, "usage: OpusStorage <wav> <bitrate> [chunk_s]\n"); return 2; }
    int bitrate = atoi(argv[2]);
    double chunkSeconds = argc > 3 ? atof(argv[3]) : 5.0;
    FILE* f = fopen(argv[1], "rb");
    if (!f) return 1;
    // Minimal RIFF walk to the fmt and data chunks.
    char id[4]; uint32_t size; uint16_t channels = 0, bits = 0; uint32_t rate = 0;
    fseek(f, 12, SEEK_SET);
    std::vector<int16_t> pcm;
    while (fread(id, 1, 4, f) == 4 && fread(&size, 4, 1, f) == 1) {
        if (!memcmp(id, "fmt ", 4)) {
            uint16_t tag; fread(&tag, 2, 1, f); fread(&channels, 2, 1, f);
            fread(&rate, 4, 1, f); fseek(f, 6, SEEK_CUR); fread(&bits, 2, 1, f);
            fseek(f, size - 16, SEEK_CUR);
        } else if (!memcmp(id, "data", 4)) {
            pcm.resize(size / 2);
            pcm.resize(fread(pcm.data(), 2, pcm.size(), f));
            break;
        } else {
            fseek(f, size + (size & 1), SEEK_CUR);
        }
    }
    fclose(f);
    if (channels != 1 || bits != 16) { fprintf(stderr, "need mono 16-bit\n"); return 1; }

    int err = 0;
    OpusEncoder* enc = opus_encoder_create(rate, 1, OPUS_APPLICATION_VOIP, &err);
    if (err != OPUS_OK) { fprintf(stderr, "encoder: %s\n", opus_strerror(err)); return 1; }
    opus_encoder_ctl(enc, OPUS_SET_BITRATE(bitrate));
    opus_encoder_ctl(enc, OPUS_SET_VBR(1));
    opus_encoder_ctl(enc, OPUS_SET_VBR_CONSTRAINT(1));
    opus_encoder_ctl(enc, OPUS_SET_COMPLEXITY(10));
    opus_encoder_ctl(enc, OPUS_SET_SIGNAL(OPUS_SIGNAL_VOICE));

    const int frame = static_cast<int>(rate / 50);  // 20 ms
    std::vector<unsigned char> packet(4000);
    uint64_t payload = 0, packets = 0, lacing = 0;
    FILETIME c, e, k0, u0, k1, u1;
    GetThreadTimes(GetCurrentThread(), &c, &e, &k0, &u0);
    for (size_t i = 0; i + frame <= pcm.size(); i += frame) {
        int n = opus_encode(enc, pcm.data() + i, frame, packet.data(), (int)packet.size());
        if (n < 0) { fprintf(stderr, "encode: %s\n", opus_strerror(n)); return 1; }
        payload += n;
        lacing += n / 255 + 1;
        ++packets;
    }
    GetThreadTimes(GetCurrentThread(), &c, &e, &k1, &u1);
    auto ft = [](FILETIME t) { return (static_cast<uint64_t>(t.dwHighDateTime) << 32 | t.dwLowDateTime) / 1e7; };
    double cpu = ft(k1) - ft(k0) + ft(u1) - ft(u0);
    double audioSeconds = static_cast<double>(packets) * frame / rate;
    // Ogg: 27-byte header per page plus lacing values; one page per second, plus
    // the OpusHead/OpusTags pages (~19 + ~60 bytes, two headers) per chunk file.
    double pages = audioSeconds;
    double chunks = audioSeconds / chunkSeconds;
    double ogg = pages * 27 + lacing + chunks * (2 * 28 + 19 + 60);
    double mbPerHour = (payload + ogg) / audioSeconds * 3600 / 1e6;
    SYSTEM_INFO si; GetSystemInfo(&si);
    printf("{\"input\": \"%s\", \"rate\": %u, \"bitrate\": %d, \"chunk_seconds\": %.1f, "
           "\"audio_seconds\": %.1f, \"payload_bytes\": %llu, \"ogg_overhead_bytes\": %.0f, "
           "\"mb_per_hour\": %.2f, \"encode_cpu_seconds\": %.3f, "
           "\"core_percent\": %.3f, \"machine_percent\": %.4f}\n",
           argv[1], rate, bitrate, chunkSeconds, audioSeconds, payload, ogg, mbPerHour, cpu,
           100 * cpu / audioSeconds, 100 * cpu / audioSeconds / si.dwNumberOfProcessors);
    opus_encoder_destroy(enc);
    return 0;
}
