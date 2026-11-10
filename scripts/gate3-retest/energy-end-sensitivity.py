"""Sensitivity evidence, offline: re-measure the acoustic end of EVERY annotated utterance with the two alternative energy rules
used in the 12-clip spot check, and report how far each differs from the annotated acoustic_end (the approved 5 ms two-threshold
rule). This is NOT independent ground truth, has no pass/fail tolerance, changes no bound, and scores nothing."""
import argparse
import hashlib
import json
import math
import statistics
import wave
import array
from pathlib import Path

RULES = {'B_10ms_10pct': (0.010, 0.10), 'C_20ms_1pct': (0.020, 0.01)}


def rms(samples, start, count):
    segment = samples[start:start+count]
    return math.sqrt(sum(v*v for v in segment)/max(1, len(segment)))


def energy_end(samples, rate, low, high, frame_s, relative):
    n, first, last = int(frame_s*rate), int(low*rate), int(high*rate)
    levels = [rms(samples, i, n) for i in range(first, last, n)]
    threshold = max(128, max(levels)*relative)
    active = [k for k, v in enumerate(levels) if v >= threshold]
    return (first+(active[-1]+1)*n)/rate


def summary(values):
    values = sorted(values)
    return {'n': len(values), 'median': round(statistics.median(values), 4),
            'p95': round(values[min(len(values)-1, math.ceil(.95*len(values))-1)], 4), 'max': round(values[-1], 4)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assembly', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    rows = []
    for track in ('microphone', 'meeting'):
        annotations = json.loads((args.assembly/(track+'-annotations.json')).read_text(encoding='utf-8-sig'))
        with wave.open(str(args.assembly/(track+'.wav'))) as stream:
            rate, samples = stream.getframerate(), array.array('h')
            samples.frombytes(stream.readframes(stream.getnframes()))
        for u in annotations['utterances']:
            low, high = u['last_word_start']-0.05, u['crop_end_bound']
            entry = {'track': track, 'id': u['id'], 'short': u['short']}
            for name, (frame, relative) in RULES.items():
                end = energy_end(samples, rate, low, high, frame, relative)
                entry[name] = end-u['acoustic_end']
                entry[name+'_outside_spread'] = max(0.0, u['earliest_acoustic_end_s']-end, end-u['latest_acoustic_end_s'])
            rows.append(entry)
    result = {'utterances': len(rows), 'annotation_hashes': {t: hashlib.sha256((args.assembly/(t+'-annotations.json')).read_bytes()).hexdigest()
                                                              for t in ('microphone', 'meeting')}, 'rules': {k: list(v) for k, v in RULES.items()}}
    for name in RULES:
        groups = {'all': rows, 'microphone': [r for r in rows if r['track'] == 'microphone'], 'meeting': [r for r in rows if r['track'] == 'meeting'],
                  'long': [r for r in rows if not r['short']], 'short': [r for r in rows if r['short']]}
        result[name] = {g: {'abs_difference_s': summary([abs(r[name]) for r in rs]), 'signed_median_s': round(statistics.median([r[name] for r in rs]), 4),
                            'outside_annotated_spread_s': summary([r[name+'_outside_spread'] for r in rs]),
                            'count_outside_spread': sum(r[name+'_outside_spread'] > 1e-9 for r in rs)} for g, rs in groups.items()}
    args.out.write_text(json.dumps({**result, 'rows': rows}, indent=1), encoding='utf-8')
    print(json.dumps(result, indent=1))


if __name__ == '__main__':
    main()
