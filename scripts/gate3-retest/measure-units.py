"""Measure preserved invented unit WAVs offline; never synthesize or play audio."""
import argparse
import hashlib
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from constructed_units import measure, measure_report, read_json, read_wav, write_json


def report_only(args, manifest):
    """Measure all units with the unchanged algorithm; a verdict is never written."""
    if manifest['method'] != 'ConstructedUnits':
        raise ValueError('ConstructedUnits manifest required')
    rows = {}
    for unit in manifest['units']:
        row = {'track': unit['track'], 'text': unit.get('text'), 'utterance_id': unit.get('utterance_id'),
               'role': unit.get('role'), 'source_sha256': unit['sha256']}
        try:
            path = args.manifest.parent/unit['file']
            samples = read_wav(path)
            row['source_hash_matches'] = hashlib.sha256(path.read_bytes()).hexdigest() == unit['sha256']
            row['source_samples_match'] = len(samples) == unit['samples']
            row.update(measure_report(samples))
        except Exception as error:
            row['read_error'] = str(error)
        rows[unit['unit_id']] = row
    write_json(args.output/'report-only-measurements.json', {
        'status': 'REPORT_ONLY', 'verdict': None, 'units': rows,
        'unit_manifest_sha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
        'measurement_script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'measurement_helper_sha256': hashlib.sha256(Path(__file__).with_name('constructed_units.py').read_bytes()).hexdigest()})


def main():
    """Write measurements into a fresh derived folder, preserving any failures."""
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--report-only', action='store_true',
                        help='measure every unit, record values and exceeded limits, never abort or judge')
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    manifest = read_json(args.manifest)
    if args.report_only:
        return report_only(args, manifest)
    if manifest['method'] != 'ConstructedUnits':
        raise ValueError('ConstructedUnits manifest required')
    rows = {}
    try:
        for unit in manifest['units']:
            path = args.manifest.parent/unit['file']
            samples = read_wav(path)
            if hashlib.sha256(path.read_bytes()).hexdigest() != unit['sha256'] or len(samples) != unit['samples']:
                raise ValueError('Original unit hash or sample-count mismatch')
            rows[unit['unit_id']] = measure(samples)
            rows[unit['unit_id']]['source_sha256'] = unit['sha256']
        write_json(args.output/'measurements.json', {'status': 'UNFROZEN', 'units': rows,
                   'unit_manifest_sha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
                   'measurement_script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                   'measurement_helper_sha256': hashlib.sha256(Path(__file__).with_name('constructed_units.py').read_bytes()).hexdigest()})
    except Exception as error:
        write_json(args.output/'measurement-failure.json', {'error': str(error), 'completed': rows})
        raise


if __name__ == '__main__':
    main()
