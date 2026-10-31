#pragma once
#include <cstdint>

namespace scrb {

// The latest device change restarts the quiet period; never reopen for a four-second flap.
class StableDebounce {
public:
    void Changed(int64_t nowNs, int64_t quietNs) { dueNs_ = nowNs + quietNs; }
    bool Due(int64_t nowNs) {
        if (!dueNs_ || nowNs < dueNs_) return false;
        dueNs_ = 0;
        return true;
    }
private:
    int64_t dueNs_ = 0;
};

}  // namespace scrb
