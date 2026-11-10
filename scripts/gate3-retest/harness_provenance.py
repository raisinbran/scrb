"""Derive the two harness marker times from the playback log and the frozen source file (D3).

harness marker = midpoint of the waveOutRestart QPC bracket (seconds) + the marker's offset detected in the frozen source WAV.
Stated uncertainty = half the bracket width + the source detector's own step.

Limitation, not measured here: the log records when waveOutRestart was called, not when sound left the device. The
output-start latency of the audio route is not covered by this uncertainty.
"""
import math

START_EVENT = {'microphone': 'microphone_start', 'meeting': 'system_start'}
SOURCE_WINDOWS = {'lead': (0, 10), 'trail': (380, 390)}
TOLERANCE_S = 1e-9
LIMITATION = ('The playback log brackets the waveOutRestart call, not the moment sound left the device; '
              'the unmeasured output-start latency of the audio route is a remaining limitation.')


def need(condition, message):
    if not condition:
        raise ValueError(message)


def is_int(value):
    return type(value) is int


def derive_harness_markers(events, track, source, rate):
    from marker_clock import detect_marker
    need(track in START_EVENT, 'Unknown track')
    need(isinstance(events, list), 'Missing harness log')
    devices = [e for e in events if isinstance(e, dict) and e.get('event') == 'devices']
    need(len(devices) == 1, 'Harness log needs exactly one devices event')
    frequency = (devices[0].get('data') or {}).get('stopwatch_frequency')
    need(is_int(frequency) and frequency > 0, 'Harness log lacks the QPC frequency')
    starts = [e for e in events if isinstance(e, dict) and e.get('event') == START_EVENT[track]]
    need(len(starts) == 1, 'Harness log needs exactly one %s event' % START_EVENT[track])
    data = starts[0].get('data') or {}
    before, after = (data.get(k) or {} for k in ('before', 'after'))
    ticks = (before.get('qpc_ticks'), after.get('qpc_ticks'), (starts[0].get('stamp') or {}).get('qpc_ticks'))
    need(all(is_int(t) and t >= 0 for t in ticks) and ticks[0] <= ticks[1] <= ticks[2],
         'Harness start bracket (QPC ticks before and after waveOutRestart) is missing or out of order')
    half_width = (ticks[1]-ticks[0])/2/frequency
    midpoint = (ticks[0]+ticks[1])/2/frequency
    frequency_hz = {'microphone': 880, 'meeting': 1320}[track]
    offsets = {name: detect_marker(source, rate, frequency_hz, window) for name, window in SOURCE_WINDOWS.items()}
    harness = [midpoint+offsets[name]['position'] for name in ('lead', 'trail')]
    harness_u = [half_width+offsets[name]['uncertainty_s'] for name in ('lead', 'trail')]
    return {'track': track, 'start_event': START_EVENT[track], 'qpc_frequency_hz': frequency,
            'start_bracket_ticks': [ticks[0], ticks[1]], 'start_bracket_s': [ticks[0]/frequency, ticks[1]/frequency],
            'bracket_half_width_s': half_width, 'midpoint_s': midpoint,
            'source_marker_offsets_s': [offsets['lead']['position'], offsets['trail']['position']],
            'source_marker_uncertainty_s': [offsets['lead']['uncertainty_s'], offsets['trail']['uncertainty_s']],
            'harness': harness, 'harness_u': harness_u, 'limitation': LIMITATION}


def verify_harness_evidence(evidence, derived):
    """The supplied harness markers must equal the derived ones; the supplied uncertainty must cover the derived one."""
    supplied, supplied_u = evidence.get('harness'), evidence.get('harness_u')
    ok = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    need(isinstance(supplied, (list, tuple)) and len(supplied) == 2 and all(ok(v) for v in supplied),
         'Harness marker times are missing or invalid')
    need(isinstance(supplied_u, (list, tuple)) and len(supplied_u) == 2 and all(ok(v) and v >= 0 for v in supplied_u),
         'Harness marker uncertainty is missing: it must cover the playback start bracket')
    for name, given, want in zip(('lead', 'trail'), supplied, derived['harness']):
        need(abs(given-want) <= TOLERANCE_S, 'Supplied %s harness marker time %r differs from the one derived from the playback log '
             'and the frozen source (%r); unbound' % (name, given, want))
    for name, given, want in zip(('lead', 'trail'), supplied_u, derived['harness_u']):
        need(given >= want-TOLERANCE_S, 'Supplied %s harness uncertainty %r is below the start bracket plus source detection (%r)'
             % (name, given, want))
    return list(supplied), list(supplied_u)
