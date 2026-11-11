#!/usr/bin/env python3
"""Verify a clean checkout and the private files against the Gate 3 preflight manifest.

Run before capture and again before scoring, from the clean checkout at the manifest's pinned
commit. Exit 0 only if everything matches; any mismatch, missing entry, missing file, unlisted
script or dirty tree exits 1 (bad usage or unreadable manifest exits 2).

  python verify-against-manifest.py --manifest <approved manifest.json> --approved-manifest-sha256 <64 hex> [--checkout <root>]

Tracked files are hashed from `git show <commit>:<path>` bytes; private files from their raw bytes.
The manifest is not part of the pin, so it is passed in. Its SHA-256 is computed over the file bytes with CRLF
replaced by LF (this equals the bytes `git show` prints for the committed file, so a Windows checkout that converts
line endings cannot change the value) and must equal the owner-approved value given on the command line.
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys

TRACKED_SCRIPT_DIR = 'scripts/gate3-retest'
IGNORED_OK = ('__pycache__/',)
REQUIRED_SECTIONS = ('pins', 'documents', 'scripts_and_tests', 'private_evidence', 'native_candidate',
                     'hashing_method', 'inventory_counts', 'run_binding')


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def git(checkout, *args):
    return subprocess.run(['git', '-C', checkout] + list(args), capture_output=True, check=False)


def lf(data):
    return data.replace(b'\r\n', b'\n')


class Report:
    def __init__(self):
        self.verified = 0
        self.failures = []

    def ok(self):
        self.verified += 1

    def fail(self, message):
        self.failures.append(message)
        print('MISMATCH: ' + message)


def collect(manifest):
    """Every hashed entry in the manifest as a dict with kind, label, path, sha256 and optional fields."""
    entries = []

    def add(kind, label, **fields):
        fields.update(kind=kind, label=label)
        entries.append(fields)

    def walk(node, where):
        if isinstance(node, dict):
            method = node.get('method')
            if 'path' in node and 'sha256' in node and method == 'git-show-blob-bytes':
                add('git', where, path=node['path'], sha256=node['sha256'], commit=node.get('git_commit_id'))
            elif 'path' in node and 'sha256' in node and method == 'raw-file-bytes':
                add('raw', where, path=node['path'], sha256=node['sha256'], base=node.get('base'), size=node.get('bytes'))
            elif 'path' in node and 'sha256_recomputed' in node:
                add('raw', where, path=node['path'], sha256=node['sha256_recomputed'], base=node.get('base'), size=None)
                if 'sha256_in_fixture' in node and node['sha256_in_fixture'] != node['sha256_recomputed']:
                    add('bad', where, detail='sha256_in_fixture differs from sha256_recomputed for ' + node['path'])
            elif 'path' in node and 'sha256' in node:
                add('bad', where, detail='entry has no known method: ' + node['path'])
            for key, value in node.items():
                if key != 'units':
                    walk(value, where + '.' + key)
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, where + '[%d]' % index)

    walk(manifest, '')
    private = manifest.get('private_evidence', {})
    units = private.get('unit_wavs_r3')
    if units:
        add('raw', 'private_evidence.unit_wavs_r3.units_manifest', path='units-manifest.json',
            sha256=units['units_manifest_sha256'], base=units['base'], size=None)
        for name, pair in units.get('units', {}).items():
            add('raw', 'unit_wavs_r3.' + name, path=name, sha256=pair['wav_sha256'], base=units['base'], size=None)
            add('raw', 'unit_wavs_r3.' + name + '.unit.json', path=name + '.unit.json',
                sha256=pair['sidecar_sha256'], base=units['base'], size=None)
        if units.get('count') != len(units.get('units', {})):
            add('bad', 'unit_wavs_r3', detail='count %s differs from %d listed units' % (units.get('count'), len(units.get('units', {}))))
    config = manifest.get('native_candidate', {}).get('config')
    if config:
        for name in ('live-config.json', 'final-config.json'):
            add('raw', 'native_candidate.config.' + name, path=name, sha256=config[name], base=config['base'], size=None)
    return entries


def resolve_raw(entry, bases):
    path = entry['path']
    if os.path.isabs(path):
        return path
    base = entry.get('base')
    if base is None:
        base = 'preflight'
    if base not in bases:
        return None
    return os.path.join(bases[base], path)


def verify(manifest_path, checkout, approved_sha):
    report = Report()
    try:
        with open(manifest_path, 'rb') as handle:
            manifest_bytes = handle.read()
        manifest = json.loads(manifest_bytes.decode('utf-8'))
    except (OSError, ValueError) as error:
        print('cannot read manifest: %s' % error)
        return 2
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    pins = manifest.get('pins', {})
    pin = pins.get('doc_pin_commit', '')
    print('verify-against-manifest started (UTC): ' + started)
    print('manifest path: ' + os.path.abspath(manifest_path))
    manifest_sha = sha256_bytes(lf(manifest_bytes))
    print('manifest SHA-256 (CRLF normalized to LF): ' + manifest_sha)
    print('manifest SHA-256 (raw file bytes, information only): ' + sha256_bytes(manifest_bytes))
    print('approved manifest SHA-256: ' + approved_sha)
    if manifest_sha != approved_sha.strip().lower():
        report.fail('manifest SHA-256 %s differs from the approved value %s' % (manifest_sha, approved_sha))
    else:
        report.ok()
    print('manifest status: %s' % manifest.get('status'))
    print('pinned doc commit: %s; final code SHA: %s' % (pin, pins.get('final_code_sha')))

    for section in REQUIRED_SECTIONS:
        if section not in manifest:
            report.fail('manifest section missing: ' + section)
    if len(pin) != 40:
        report.fail('pins.doc_pin_commit is not a full 40-character commit id')

    # working tree must be a clean checkout of the pin
    top = git(checkout, 'rev-parse', '--show-toplevel')
    if top.returncode != 0:
        report.fail('not a git checkout: ' + checkout)
        return finish(report, manifest_bytes)
    if os.path.normcase(os.path.realpath(top.stdout.decode().strip())) != os.path.normcase(os.path.realpath(checkout)):
        report.fail('checkout path is not the repository root: ' + checkout)
    head = git(checkout, 'rev-parse', 'HEAD').stdout.decode().strip()
    print('checkout HEAD: ' + head)
    if head != pin:
        report.fail('HEAD %s is not the pinned commit %s' % (head, pin))
    else:
        report.ok()
    status = git(checkout, 'status', '--porcelain', '--ignored=matching', '--untracked-files=all').stdout.decode().splitlines()
    for line in status:
        name = line[3:].strip().replace('\\', '/')
        if line.startswith('!!') and any(name.endswith(ok) or ('/' + ok) in name or name.startswith(ok) for ok in IGNORED_OK):
            continue
        report.fail('working tree is not clean: ' + line)
    if not status:
        report.ok()

    bases = dict(manifest.get('hashing_method', {}).get('private_bases', {}))
    entries = collect(manifest)
    git_paths = set()
    for entry in entries:
        label = '%s (%s)' % (entry['label'], entry.get('path', ''))
        if entry['kind'] == 'bad':
            report.fail(entry['label'] + ': ' + entry['detail'])
            continue
        if len(entry['sha256']) != 64 or any(ch not in '0123456789abcdef' for ch in entry['sha256']):
            report.fail('not a full lowercase 64-character SHA-256: ' + label)
            continue
        if entry['kind'] == 'git':
            commit = entry['commit']
            if commit not in (pin, manifest.get('native_candidate', {}).get('commit')):
                report.fail('git entry pinned to an unexpected commit %s: %s' % (commit, label))
                continue
            shown = git(checkout, 'show', '%s:%s' % (commit, entry['path']))
            if shown.returncode != 0:
                report.fail('git show failed: ' + label)
                continue
            if sha256_bytes(shown.stdout) != entry['sha256']:
                report.fail('tracked file hash differs: ' + label)
                continue
            if commit == pin:
                git_paths.add(entry['path'])
                working = os.path.join(checkout, entry['path'])
                if not os.path.isfile(working):
                    report.fail('tracked file missing from the working tree: ' + label)
                    continue
                with open(working, 'rb') as handle:
                    if lf(handle.read()) != lf(shown.stdout):
                        report.fail('working-tree file differs from the pinned blob (line endings aside): ' + label)
                        continue
            report.ok()
        else:
            path = resolve_raw(entry, bases)
            if path is None:
                report.fail('unknown private base %r: %s' % (entry.get('base'), label))
                continue
            if not os.path.isfile(path):
                report.fail('private file missing: %s -> %s' % (label, path))
                continue
            if entry.get('size') is not None and os.path.getsize(path) != entry['size']:
                report.fail('private file size differs (%d, manifest %d): %s' % (os.path.getsize(path), entry['size'], label))
                continue
            if sha256_file(path) != entry['sha256']:
                report.fail('private file hash differs: %s -> %s' % (label, path))
                continue
            report.ok()

    # no executed script may be missing from the manifest
    listing = git(checkout, 'ls-tree', '-r', '--name-only', pin, '--', TRACKED_SCRIPT_DIR)
    tracked = [name for name in listing.stdout.decode().splitlines() if name]
    if not tracked:
        report.fail('no tracked files under ' + TRACKED_SCRIPT_DIR + ' at the pin')
    for name in tracked:
        if name not in git_paths:
            report.fail('tracked script not listed in the manifest: ' + name)
    run_binding = manifest.get('run_binding', {})
    for role in ('orchestrator', 'playback_script', 'verifier'):
        item = run_binding.get(role)
        if not item or item.get('path') not in git_paths:
            report.fail('run_binding.%s is missing or not a pinned entry' % role)
        else:
            report.ok()
    for child in run_binding.get('backup_scripts', []):
        if child not in git_paths:
            report.fail('run_binding backup script is not a pinned entry: ' + child)
        else:
            report.ok()
    counts = manifest.get('inventory_counts', {})
    actual = {
        'documents': len(manifest.get('documents', [])),
        'scripts_and_tests': len(manifest.get('scripts_and_tests', [])),
        'candidate_built_artifacts': len(manifest.get('native_candidate', {}).get('built_artifacts', [])),
        'tools_and_models': len(manifest.get('native_candidate', {}).get('tools_and_models_from_live_config', [])),
    }
    for key, value in actual.items():
        if counts.get(key) != value:
            report.fail('inventory_counts.%s is %s but %d are listed' % (key, counts.get(key), value))
        else:
            report.ok()
    return finish(report, manifest_bytes)


def finish(report, manifest_bytes):
    ended = datetime.datetime.now(datetime.timezone.utc).isoformat()
    print('entries and checks verified: %d' % report.verified)
    print('mismatches: %d' % len(report.failures))
    print('verify-against-manifest ended (UTC): ' + ended)
    print('RESULT: ' + ('PASS' if not report.failures else 'FAIL'))
    return 0 if not report.failures else 1


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--approved-manifest-sha256', required=True, help='the owner-approved SHA-256 of the manifest (LF-normalized)')
    parser.add_argument('--checkout', default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    args = parser.parse_args(argv)
    return verify(args.manifest, args.checkout, args.approved_manifest_sha256)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
