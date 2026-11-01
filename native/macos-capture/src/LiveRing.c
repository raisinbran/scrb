#include "LiveRing.h"
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

struct LiveRing {
    _Atomic uint64_t head;
    _Atomic uint64_t tail;
    _Atomic bool stopped;
    uint64_t attempted;
    LiveSlot slots[LIVE_RING_SLOTS];
};

LiveRing *live_ring_create(void) { return calloc(1, sizeof(LiveRing)); }
void live_ring_destroy(LiveRing *ring) { free(ring); }

bool live_offer(LiveRing *ring, const int16_t *samples, uint32_t count,
                int64_t startNs, double rate, uint32_t generation, bool boundary) {
    uint64_t attempt = ring->attempted++;
    if (atomic_load_explicit(&ring->stopped, memory_order_relaxed)) return false;
    uint64_t head = atomic_load_explicit(&ring->head, memory_order_relaxed);
    if (head - atomic_load_explicit(&ring->tail, memory_order_acquire) >= LIVE_RING_SLOTS)
        return false;
    LiveSlot *slot = &ring->slots[head % LIVE_RING_SLOTS];
    slot->startNs = startNs;
    slot->rate = rate;
    slot->attempt = attempt;
    slot->generation = generation;
    slot->count = count;
    slot->boundary = boundary;
    if (count) memcpy(slot->samples, samples, count * sizeof(int16_t));
    atomic_store_explicit(&ring->head, head + 1, memory_order_release);
    return true;
}

const LiveSlot *live_peek(LiveRing *ring) {
    uint64_t tail = atomic_load_explicit(&ring->tail, memory_order_relaxed);
    if (tail == atomic_load_explicit(&ring->head, memory_order_acquire)) return NULL;
    return &ring->slots[tail % LIVE_RING_SLOTS];
}
void live_advance(LiveRing *ring) {
    atomic_fetch_add_explicit(&ring->tail, 1, memory_order_release);
}
void live_request_stop(LiveRing *ring) { atomic_store(&ring->stopped, true); }
bool live_is_stopped(LiveRing *ring) { return atomic_load(&ring->stopped); }
