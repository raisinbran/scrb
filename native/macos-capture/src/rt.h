// Everything that runs on the real-time audio threads: the shared gate and one lock-free ring per
// track. No allocation, locks or Swift here. See docs/plans/pause-resume.md, "The gate".
#pragma once
#include <CoreAudio/CoreAudio.h>
#include <mach/mach_time.h>
#include <opus.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdlib.h>

#define RT_SLOT_FRAMES 2048
#define RT_SLOTS 4096

typedef struct {
  uint64_t host;
  uint32_t frames;
  uint32_t generation;
  int16_t samples[RT_SLOT_FRAMES];
} RtSlot;

typedef struct {
  _Atomic uint64_t head;
  _Atomic uint64_t tail;
  _Atomic uint64_t dropped;
  _Atomic uint64_t lastPacketHost;
  _Atomic uint32_t peak;
  RtSlot *slots;
  double rate;
} RtRing;

// Packets pass only if they start at or after resumeAfter and end by cutoff.
typedef struct {
  _Atomic uint64_t resumeAfter;
  _Atomic uint64_t cutoff;
  _Atomic uint32_t generation;
} RtGate;

extern RtGate rtGate;
extern double rtTicksPerSecond;

static inline void rt_init(void) {
  mach_timebase_info_data_t info;
  mach_timebase_info(&info);
  rtTicksPerSecond = 1e9 * (double)info.denom / (double)info.numer;
  atomic_store(&rtGate.cutoff, 0);
}

static inline uint64_t rt_gate_close(void) {
  uint64_t now = mach_absolute_time();
  atomic_store(&rtGate.cutoff, now);
  return now;
}

static inline uint64_t rt_gate_open(void) {
  uint64_t now = mach_absolute_time();
  atomic_store(&rtGate.resumeAfter, now);
  atomic_fetch_add(&rtGate.generation, 1);
  atomic_store(&rtGate.cutoff, UINT64_MAX);
  return now;
}

static inline int rt_gate_is_open(void) { return atomic_load(&rtGate.cutoff) == UINT64_MAX; }
static inline uint32_t rt_gate_generation(void) { return atomic_load(&rtGate.generation); }

static inline RtRing *rt_ring_create(void) {
  RtRing *ring = calloc(1, sizeof(RtRing));
  ring->slots = calloc(RT_SLOTS, sizeof(RtSlot));
  return ring;
}

static inline void rt_capture(RtRing *ring, const AudioBufferList *list, uint64_t host) {
  atomic_store(&ring->lastPacketHost, host);
  const AudioBuffer *buffer = NULL;
  for (UInt32 i = 0; i < list->mNumberBuffers; i++) {
    if (list->mBuffers[i].mData && list->mBuffers[i].mDataByteSize) {
      buffer = &list->mBuffers[i];
      break;
    }
  }
  if (!buffer || ring->rate <= 0) return;
  uint32_t channels = buffer->mNumberChannels ? buffer->mNumberChannels : 1;
  uint32_t frames = buffer->mDataByteSize / sizeof(float) / channels;
  const float *input = buffer->mData;
  uint64_t durationTicks = (uint64_t)(frames / ring->rate * rtTicksPerSecond);
  uint32_t peak = 0;
  for (uint32_t i = 0; i < frames * channels; i++) {
    float value = input[i] < 0 ? -input[i] : input[i];
    uint32_t level = (uint32_t)(value * 32767.f);
    if (level > peak) peak = level;
  }
  atomic_store(&ring->peak, peak);

  // The gate sits ahead of everything else: nothing past this line exists for a closed gate.
  if (host < atomic_load(&rtGate.resumeAfter) || host + durationTicks > atomic_load(&rtGate.cutoff))
    return;

  uint32_t done = 0;
  uint32_t generation = atomic_load(&rtGate.generation);
  while (done < frames) {
    uint64_t head = atomic_load(&ring->head);
    if (head - atomic_load(&ring->tail) >= RT_SLOTS) {
      atomic_fetch_add(&ring->dropped, frames - done);
      return;
    }
    RtSlot *slot = &ring->slots[head % RT_SLOTS];
    uint32_t count = frames - done < RT_SLOT_FRAMES ? frames - done : RT_SLOT_FRAMES;
    slot->host = host + (uint64_t)(done / ring->rate * rtTicksPerSecond);
    slot->frames = count;
    slot->generation = generation;
    for (uint32_t i = 0; i < count; i++) {
      float mixed = 0;
      for (uint32_t c = 0; c < channels; c++) mixed += input[(done + i) * channels + c];
      mixed /= channels;
      if (mixed > 1.f) mixed = 1.f;
      if (mixed < -1.f) mixed = -1.f;
      slot->samples[i] = (int16_t)(mixed * 32767.f);
    }
    atomic_store(&ring->head, head + 1);
    done += count;
  }
}

static inline RtSlot *rt_peek(RtRing *ring) {
  uint64_t tail = atomic_load(&ring->tail);
  return tail == atomic_load(&ring->head) ? NULL : &ring->slots[tail % RT_SLOTS];
}

static inline void rt_advance(RtRing *ring) { atomic_fetch_add(&ring->tail, 1); }
static inline uint64_t rt_last_packet(RtRing *ring) { return atomic_load(&ring->lastPacketHost); }
static inline void rt_touch(RtRing *ring) { atomic_store(&ring->lastPacketHost, mach_absolute_time()); }
static inline uint32_t rt_peak(RtRing *ring) { return atomic_load(&ring->peak); }
static inline int rt_empty(RtRing *ring) { return atomic_load(&ring->tail) == atomic_load(&ring->head); }
static inline uint64_t rt_take_dropped(RtRing *ring) { return atomic_exchange(&ring->dropped, 0); }

static inline OpusEncoder *rt_encoder(int32_t rate, int *lookahead) {
  int error = 0;
  OpusEncoder *encoder = opus_encoder_create(rate, 1, OPUS_APPLICATION_VOIP, &error);
  if (error != OPUS_OK) return NULL;
  opus_encoder_ctl(encoder, OPUS_SET_BITRATE(32000));
  opus_encoder_ctl(encoder, OPUS_GET_LOOKAHEAD(lookahead));
  return encoder;
}
