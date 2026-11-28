project('scrb-apm-filter', 'cpp', version: '0.1.0',
  default_options: ['cpp_std=c++20', 'buildtype=release', 'default_library=static', 'warning_level=2'])

# Upstream's own default is C++17, which MSVC rejects (designated initializers), so force C++20.
apm_proj = subproject('webrtc-audio-processing', default_options: ['cpp_std=c++20'])
executable('scrb-apm-filter', 'apm_filter.cpp', include_directories: include_directories('subprojects', 'subprojects/webrtc-audio-processing/webrtc'), dependencies: [apm_proj.get_variable('audio_processing_dep')], install: false, cpp_args: ['-DWEBRTC_APM_DEBUG_DUMP=0', '-DWEBRTC_WIN', '-DNOMINMAX'])
