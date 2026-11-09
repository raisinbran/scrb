"""Measure preserved invented unit WAVs offline; never synthesize or play audio."""
import argparse
import hashlib
from pathlib import Path
from constructed_units import measure, read_json, read_wav, write_json


def main():
    """Write measurements into a fresh derived folder, preserving any failures."""
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    manifest = read_json(args.manifest)
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
