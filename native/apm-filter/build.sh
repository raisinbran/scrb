#!/bin/sh
# Builds build/scrb-apm-filter from the pinned WebRTC APM (see subprojects/). Needs meson and ninja.
set -e
cd "$(dirname "$0")"
[ -d build ] || meson setup build --wrap-mode=forcefallback
meson compile -C build
