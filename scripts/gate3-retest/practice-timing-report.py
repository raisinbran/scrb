"""Offline coverage and drift report on the retained practice recording (no scoring). Reads only invented practice audio.

Usage: python practice-timing-report.py [practice-root]   (default: SCRB_V3A_PRACTICE_ROOT, then the sibling preflight folder)

Drift-rate bound: for every pair of valid long anchors at least 60 s apart in source time with no chunk-timestamp event of 5 ms or
more between them, (|offset difference| + both anchor uncertainties) / source separation; the report prints the per-track maximum.
The anchor uncertainties are added on purpose so the number is a maximum, not a median, and is not a fit."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here))
import v3a_timing as timing   # noqa: E402
from long_correlation import annotation_units, detect_long_steps   # noqa: E402

MIN_BASELINE_S = 60.0
root = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('SCRB_V3A_PRACTICE_ROOT', str(here.parents[2]/'gate3-v3-preflight-20261108')))
manifest = json.loads((here/'practice_step_fixture.json').read_text(encoding='utf-8'))
raw = manifest['raw_microphone']
contexts = json.loads((root/raw['marker_context']['path']).read_text())
report = {}
for track in ('microphone', 'meeting'):
    ctx, files = contexts[track], manifest['tracks'][track]
    metadata = str(root/raw['metadata']['path']).replace('microphone', track)
    out = tempfile.mktemp(suffix='.json')
    run = subprocess.run([sys.executable, str(here/'marker_clock.py'), metadata, out, '--mode', 'v3a', '--track', track,
                          '--decoder', str(root/raw['decoder']['path']), '--harness', *map(str, ctx['harness_marker_anchors_s']),
                          '--harness-u', *map(str, [ctx['harness_anchor_uncertainty_s']]*2)], capture_output=True, text=True, timeout=300)
    if run.returncode:
        raise SystemExit('clock failed for %s: %s' % (track, run.stderr[-300:]))
    clock = json.loads(Path(out).read_text(encoding='utf-8'))
    source, source_rate = timing.pcm16(root/files['source']['path'])
    continuous, rate = timing.pcm16(root/files['continuous']['path'])
    annotations = json.loads((root/files['annotations']['path']).read_text(encoding='utf-8-sig'))
    found = detect_long_steps(continuous, rate, source, source_rate, annotation_units(annotations, source_rate),
                              clock['sample_continuous']['lead']['position']-1)
    mapping = clock['gap_map']
    from marker_clock import detect_marker
    marker = detect_marker(source, source_rate, {'microphone': 880, 'meeting': 1320}[track], (0, 10))
    lead = timing.lead_marker_anchor(clock['sample_continuous'], marker['position'], marker['uncertainty_s'])
    anchors = timing.apply_template_step_condition([lead]+found['anchors'], mapping)
    longs = [a for a in anchors if a['method'] != 'lead-marker']
    excluded = timing.excluded_anchors(anchors)
    gone = {i for i, _ in excluded}
    valid = [a for a in anchors if a['id'] not in gone]
    events = timing.step_events(mapping)
    intervals = timing.unexplained_intervals(anchors, mapping)
    brackets = timing.unexplained_brackets(valid, mapping)
    rates = []
    valid_longs = [a for a in valid if a['method'] != 'lead-marker']
    for i, p in enumerate(valid_longs):
        for q in valid_longs[i+1:]:
            span = q['source_start_s']-p['source_end_s']
            if span >= MIN_BASELINE_S and not any(p['recording_end_s'] < e < q['recording_start_s'] for e in events):
                rates.append((abs(q['offset_s']-p['offset_s'])+p['uncertainty_s']+q['uncertainty_s'])/span)
    reasons = {}
    scoreable = 0
    for u in annotations['utterances']:
        reason = timing.unit_timing_gap(u['start'], u['acoustic_end'], anchors, valid, brackets, intervals)
        if reason:
            reasons[u['id']] = reason
        else:
            scoreable += 1
    report[track] = {'long_anchors': len(longs), 'valid': len(valid_longs), 'excluded': [{'id': i, 'reason': r} for i, r in excluded],
                     'events_s': events, 'unexplained_intervals': intervals, 'drift_pairs': len(rates),
                     'drift_rate_max_s_per_s': max(rates, default=None), 'units': len(annotations['utterances']),
                     'timing_coverage_ok_before_gap_overlap': scoreable, 'timing_inconclusive': reasons,
                     'anchor_spacing_max_s': max(b['source_start_s']-a['source_end_s'] for a, b in zip(longs, longs[1:]))}
    # Word-interval overlap with a recorded gap needs the placed unit intervals, so run the real placement on the units that remain.
    probes = []
    for u in annotations['utterances']:
        if u['id'] in reasons:
            continue
        probes.append({'id': u['id'], 'eligible': u['eligible'], 'source_start_s': u['start'], 'source_last_word_start_s': u['last_word_start'],
                       'source_last_word_end_s': u['acoustic_end'], 'outcome': 'MATCHED', 'identity_confirmed': True,
                       'endpoints': [], 'reference_words': ['x']})
    spreads = {u['id']: u for u in annotations['utterances']}
    try:
        probes = timing.attach_source_spread(probes, annotations['utterances'])
        prepared, _ = timing.prepare_units(probes, mapping, valid, all_anchors=anchors)
        overlap = {u['id']: timing.capture_event_overlap(u, mapping) for u in prepared}
        report[track]['gap_overlap_inconclusive'] = {k: v for k, v in overlap.items() if v}
        report[track]['still_scoreable'] = len(prepared)-len(report[track]['gap_overlap_inconclusive'])
        report[track]['drift_extra_units'] = sum(1 for u in prepared if u['drift_extra_uncertainty_s'] > 0)
    except ValueError as error:
        report[track]['placement_error'] = str(error)
print(json.dumps(report, indent=1))
