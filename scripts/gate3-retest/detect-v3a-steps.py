"""Inspect a preserved sample-continuous WAV; no playback or scoring exemption."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from long_correlation import annotation_units, detect_long_steps
from v3a_timing import digest, pcm16


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recording', type=Path, help='Every decoded sample in chunk order, without gaps/trimming/padding')
    parser.add_argument('output', type=Path)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--annotations', type=Path, required=True)
    parser.add_argument('--recording-sha256', required=True)
    parser.add_argument('--source-sha256', required=True)
    parser.add_argument('--annotations-sha256', required=True)
    parser.add_argument('--search-offset', type=float, required=True, help='Constant offset for +/-1 s searches only; never a correction')
    args = parser.parse_args()
    identities = {'recording': {'path': str(args.recording), 'sha256': args.recording_sha256},
                  'source': {'path': str(args.source), 'sha256': args.source_sha256},
                  'annotations': {'path': str(args.annotations), 'sha256': args.annotations_sha256}}
    try:
        for row in identities.values():
            if digest(row['path']) != row['sha256']:
                raise ValueError('External evidence identity mismatch')
        recording, rr = pcm16(args.recording)
        source, sr = pcm16(args.source)
        annotations = json.loads(args.annotations.read_text(encoding='utf-8-sig'))
        report = detect_long_steps(recording, rr, source, sr, annotation_units(annotations, sr), args.search_offset)
        for row in identities.values():
            if digest(row['path']) != row['sha256']:
                raise ValueError('External evidence changed during analysis')
    except (ValueError, KeyError, TypeError, OSError) as error:
        report = {'timing': 'INCONCLUSIVE', 'steps': [], 'error': str(error)}
    report.update(mode='v3a-step-diagnostic', identities=identities,
                  note='Step diagnostic only; no marker/gap/identity/latency acceptance or setup exemption.')
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, indent=2, allow_nan=False)
        stream.write('\n')
    if report['timing'] == 'INCONCLUSIVE':
        raise SystemExit(2)


if __name__ == '__main__':
    main()
