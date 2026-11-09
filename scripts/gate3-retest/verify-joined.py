"""Run joined-file arithmetic/consistency checks; not acoustic ground truth."""
import argparse
import hashlib
from pathlib import Path
from constructed_units import assert_window_energy_gap, read_json, read_wav, verify_arithmetic, write_json


def main():
    """Check recorded segment partitions without altering derived files."""
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    manifest = read_json(args.manifest)
    version = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    try:
        samples = read_wav(args.manifest.parent/manifest['file'])
        result = verify_arithmetic(samples, manifest['segments'], manifest['silences'], manifest['joins'])
        result['same_method_window_gap_s'] = assert_window_energy_gap(samples)
        result['verification_script_sha256'] = version
        write_json(args.output/'joined-verification.json', result)
    except Exception as error:
        write_json(args.output/'verification-failure.json', {'error': str(error), 'verification_script_sha256': version})
        raise


if __name__ == '__main__':
    main()
