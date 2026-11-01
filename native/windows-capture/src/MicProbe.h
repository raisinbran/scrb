#pragma once
#include "Session.h"

namespace scrb {

// Dedicated read-only WASAPI probe mode, no Session, Track writer or chunk store.
int RunMicProbe(const std::function<Command(const std::string&)>& parse);

}  // namespace scrb
