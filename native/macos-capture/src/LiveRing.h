#pragma once
#include <stdint.h>
#include <stdbool.h>
#define LIVE_SLOT_SAMPLES 2048
#define LIVE_RING_SLOTS 64

typedef struct LiveRing LiveRing;
typedef struct {
    int64_t startNs;
    double rate;
    uint64_t attempt;
    uint32_t generation;
    uint32_t count;
    bool boundary;
    int16_t samples[LIVE_SLOT_SAMPLES];
} LiveSlot;

LiveRing *live_ring_create(void);
void live_ring_destroy(LiveRing *ring);
// One producer per track, serialized by Track.mutex; one export-thread consumer.
bool live_offer(LiveRing *ring, const int16_t *samples, uint32_t count,
                int64_t startNs, double rate, uint32_t generation, bool boundary);
const LiveSlot *live_peek(LiveRing *ring);
void live_advance(LiveRing *ring);
void live_request_stop(LiveRing *ring);
bool live_is_stopped(LiveRing *ring);
