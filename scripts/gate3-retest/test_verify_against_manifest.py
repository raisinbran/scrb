"""verify-against-manifest.py: passes on the real manifest, fails on a tampered tool, a missing entry, a missing
private file, a dirty working tree and a checkout that is not the pinned commit."""
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VERIFIER = os.path.join(HERE, 'verify-against-manifest.py')
REPO = subprocess.run(['git', '-C', HERE, 'rev-parse', '--show-toplevel'], capture_output=True, check=True).stdout.decode().strip()
REAL_MANIFEST = os.path.join(REPO, 'docs', 'gates', 'windows-gate3-v3-preflight-manifest.json')
SCRIPT_DIR = 'scripts/gate3-retest'
CRLF = bytes([13, 10])
LF = bytes([10])


def run_git(cwd, *args):
    return subprocess.run(['git', '-C', cwd] + list(args), capture_output=True, check=True).stdout


def sha(data):
    return hashlib.sha256(data).hexdigest()


def lf_sha(path):
    with open(path, 'rb') as handle:
        return sha(handle.read().replace(CRLF, LF))


def verify(manifest, checkout, approved=None, omit_approved=False):
    command = [sys.executable, '-I', VERIFIER, '--manifest', manifest, '--checkout', checkout]
    if not omit_approved:
        command += ['--approved-manifest-sha256', approved if approved is not None else lf_sha(manifest)]
    proc = subprocess.run(command, capture_output=True)
    return proc.returncode, proc.stdout.decode('utf-8', 'replace')


class SyntheticRepo(unittest.TestCase):
    """A tiny repository, one private file, and a manifest of the same shape as the real one."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.repo = os.path.join(self.tmp, 'repo')
        self.private = os.path.join(self.tmp, 'private')
        os.makedirs(os.path.join(self.repo, SCRIPT_DIR))
        os.makedirs(self.private)
        run_git(self.repo, 'init', '-q')
        run_git(self.repo, 'config', 'user.email', 't@example.invalid')
        run_git(self.repo, 'config', 'user.name', 't')
        run_git(self.repo, 'config', 'core.autocrlf', 'false')
        self.files = {
            SCRIPT_DIR + '/run-scored-run.ps1': b'# orchestrator\n',
            SCRIPT_DIR + '/play-sources.ps1': b'# playback\n',
            SCRIPT_DIR + '/verify-against-manifest.py': b'# verifier\n',
            SCRIPT_DIR + '/scorer.py': b'print(1)\n',
            'doc.md': b'a document\n',
        }
        for name, data in self.files.items():
            with open(os.path.join(self.repo, name), 'wb') as handle:
                handle.write(data)
        run_git(self.repo, 'add', '-A')
        run_git(self.repo, 'commit', '-q', '-m', 'pin')
        self.pin = run_git(self.repo, 'rev-parse', 'HEAD').decode().strip()
        self.private_bytes = b'RIFFprivate\x00\x01'
        with open(os.path.join(self.private, 'source.wav'), 'wb') as handle:
            handle.write(self.private_bytes)

        def entry(path, role):
            return {'path': path, 'sha256': sha(self.files[path]), 'method': 'git-show-blob-bytes',
                    'git_commit_id': self.pin, 'role': role}
        scripts = [entry(p, 'tool') for p in self.files if p.startswith(SCRIPT_DIR)]
        self.manifest = {
            'pins': {'final_code_sha': self.pin, 'doc_pin_commit': self.pin},
            'status': 'NOT_FROZEN',
            'hashing_method': {'private_bases': {'preflight': self.private}},
            'documents': [entry('doc.md', 'doc')],
            'scripts_and_tests': scripts,
            'run_binding': {'orchestrator': {'path': SCRIPT_DIR + '/run-scored-run.ps1'},
                            'playback_script': {'path': SCRIPT_DIR + '/play-sources.ps1'},
                            'verifier': {'path': SCRIPT_DIR + '/verify-against-manifest.py'},
                            'backup_scripts': []},
            'private_evidence': {'source_wavs': [{'path': 'source.wav', 'base': 'preflight', 'method': 'raw-file-bytes',
                                                  'sha256': sha(self.private_bytes), 'bytes': len(self.private_bytes)}]},
            'native_candidate': {'built_artifacts': [], 'tools_and_models_from_live_config': []},
            'inventory_counts': {'documents': 1, 'scripts_and_tests': len(scripts),
                                 'candidate_built_artifacts': 0, 'tools_and_models': 0},
        }
        self.manifest_path = self.write_manifest(self.manifest)

    def write_manifest(self, manifest):
        path = os.path.join(self.tmp, 'manifest-%d.json' % len(os.listdir(self.tmp)))
        with open(path, 'w', encoding='utf-8', newline=chr(10)) as handle:
            json.dump(manifest, handle, indent=2)
        return path

    def manifest_sha(self):
        return lf_sha(self.manifest_path)

    def test_passes_when_everything_matches(self):
        code, out = verify(self.manifest_path, self.repo)
        self.assertEqual(code, 0, out)
        self.assertIn('RESULT: PASS', out)
        self.assertIn('manifest SHA-256 (CRLF normalized to LF): ' + self.manifest_sha(), out)
        self.assertIn('checkout HEAD: ' + self.pin, out)

    def test_one_wrong_character_in_the_approved_hash_fails(self):
        good = self.manifest_sha()
        bad = good[:-1] + ('0' if good[-1] != '0' else '1')
        code, out = verify(self.manifest_path, self.repo, approved=bad)
        self.assertEqual(code, 1, out)
        self.assertIn('differs from the approved value', out)

    def test_crlf_copy_of_the_manifest_passes_with_the_same_approved_hash(self):
        with open(self.manifest_path, 'rb') as handle:
            data = handle.read()
        crlf_path = self.manifest_path + '.crlf.json'
        with open(crlf_path, 'wb') as handle:
            handle.write(data.replace(LF, CRLF))
        self.assertNotEqual(sha(data.replace(LF, CRLF)), self.manifest_sha())
        code, out = verify(crlf_path, self.repo, approved=self.manifest_sha())
        self.assertEqual(code, 0, out)

    def test_missing_approved_hash_parameter_fails(self):
        code, out = verify(self.manifest_path, self.repo, omit_approved=True)
        self.assertEqual(code, 2, out)

    def test_changed_manifest_content_fails_against_the_old_approved_hash(self):
        manifest = copy.deepcopy(self.manifest)
        manifest['status'] = 'FROZEN'
        code, out = verify(self.write_manifest(manifest), self.repo, approved=self.manifest_sha())
        self.assertEqual(code, 1, out)
        self.assertIn('differs from the approved value', out)

    def test_tampered_tool_in_working_tree_fails(self):
        with open(os.path.join(self.repo, SCRIPT_DIR, 'scorer.py'), 'wb') as handle:
            handle.write(b'print(2)\n')
        code, out = verify(self.manifest_path, self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('not clean', out)
        self.assertIn('differs from the pinned blob', out)

    def test_tool_hash_in_manifest_not_matching_the_pin_fails(self):
        manifest = copy.deepcopy(self.manifest)
        manifest['scripts_and_tests'][0]['sha256'] = sha(b'something else')
        code, out = verify(self.write_manifest(manifest), self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('tracked file hash differs', out)

    def test_script_missing_from_manifest_fails(self):
        manifest = copy.deepcopy(self.manifest)
        manifest['scripts_and_tests'] = [e for e in manifest['scripts_and_tests'] if not e['path'].endswith('scorer.py')]
        manifest['inventory_counts']['scripts_and_tests'] -= 1
        code, out = verify(self.write_manifest(manifest), self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('tracked script not listed in the manifest: ' + SCRIPT_DIR + '/scorer.py', out)

    def test_inventory_count_that_hides_a_missing_entry_fails(self):
        manifest = copy.deepcopy(self.manifest)
        manifest['documents'] = []
        code, out = verify(self.write_manifest(manifest), self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('inventory_counts.documents', out)

    def test_run_binding_naming_an_unpinned_script_fails(self):
        manifest = copy.deepcopy(self.manifest)
        manifest['run_binding']['orchestrator']['path'] = SCRIPT_DIR + '/other.ps1'
        code, out = verify(self.write_manifest(manifest), self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('run_binding.orchestrator', out)

    def test_missing_private_file_fails(self):
        os.remove(os.path.join(self.private, 'source.wav'))
        code, out = verify(self.manifest_path, self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('private file missing', out)

    def test_changed_private_file_fails(self):
        with open(os.path.join(self.private, 'source.wav'), 'wb') as handle:
            handle.write(b'RIFFprivate\x00\x02')
        code, out = verify(self.manifest_path, self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('private file hash differs', out)

    def test_untracked_extra_script_fails(self):
        with open(os.path.join(self.repo, SCRIPT_DIR, 'extra.ps1'), 'wb') as handle:
            handle.write(b'# not pinned\n')
        code, out = verify(self.manifest_path, self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('extra.ps1', out)

    def test_head_that_is_not_the_pin_fails(self):
        with open(os.path.join(self.repo, 'doc.md'), 'ab') as handle:
            handle.write(b'more\n')
        run_git(self.repo, 'commit', '-q', '-am', 'later')
        code, out = verify(self.manifest_path, self.repo)
        self.assertEqual(code, 1, out)
        self.assertIn('is not the pinned commit', out)


class RealManifest(unittest.TestCase):
    """The committed manifest against a clean checkout of its own pin (needs the private files on this machine)."""

    @classmethod
    def setUpClass(cls):
        with open(REAL_MANIFEST, 'rb') as handle:
            cls.manifest = json.loads(handle.read().decode('utf-8'))
        cls.tmp = tempfile.mkdtemp()
        cls.checkout = os.path.join(cls.tmp, 'checkout')
        pin = cls.manifest['pins']['doc_pin_commit']
        run_git(cls.tmp, 'clone', '-q', '--no-checkout', REPO, cls.checkout)
        run_git(cls.checkout, 'config', 'core.autocrlf', 'false')
        run_git(cls.checkout, 'checkout', '-q', pin)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, True)

    def variant(self, mutate):
        manifest = copy.deepcopy(self.manifest)
        mutate(manifest)
        path = os.path.join(self.tmp, 'variant-%d.json' % len(os.listdir(self.tmp)))
        with open(path, 'w', encoding='utf-8', newline=chr(10)) as handle:
            json.dump(manifest, handle, indent=2)
        return path

    def test_passes_on_the_real_manifest(self):
        code, out = verify(REAL_MANIFEST, self.checkout)
        self.assertEqual(code, 0, out)
        self.assertIn('RESULT: PASS', out)

    def test_fails_on_a_tampered_tool_hash(self):
        def mutate(m):
            m['scripts_and_tests'][5]['sha256'] = '0' * 64
        code, out = verify(self.variant(mutate), self.checkout)
        self.assertEqual(code, 1, out)
        self.assertIn('tracked file hash differs', out)

    def test_fails_on_a_missing_script_entry(self):
        def mutate(m):
            del m['scripts_and_tests'][7]
            m['inventory_counts']['scripts_and_tests'] -= 1
        code, out = verify(self.variant(mutate), self.checkout)
        self.assertEqual(code, 1, out)
        self.assertIn('tracked script not listed in the manifest', out)

    def test_fails_on_a_dirty_working_tree(self):
        victim = os.path.join(self.checkout, SCRIPT_DIR, 'occurrence_matcher.py')
        original = open(victim, 'rb').read()
        try:
            with open(victim, 'ab') as handle:
                handle.write(b'\n# tampered\n')
            code, out = verify(REAL_MANIFEST, self.checkout)
        finally:
            with open(victim, 'wb') as handle:
                handle.write(original)
        self.assertEqual(code, 1, out)
        self.assertIn('not clean', out)


class OrchestratorPins(unittest.TestCase):
    """Static checks of run-scored-run.ps1 against the manifest (the PowerShell itself is not run here)."""

    @classmethod
    def setUpClass(cls):
        with open(REAL_MANIFEST, 'rb') as handle:
            cls.manifest = json.loads(handle.read())
        with open(os.path.join(HERE, 'run-scored-run.ps1'), 'rb') as handle:
            cls.script = handle.read().decode('utf-8')

    def electron_entry(self):
        entries = [e for e in self.manifest['native_candidate']['built_artifacts'] if e['path'] == 'node_modules/electron/dist/electron.exe']
        self.assertEqual(len(entries), 1)
        return entries[0]

    def test_manifest_pins_the_candidate_electron_executable(self):
        self.assertRegex(self.electron_entry()['sha256'], '^[0-9a-f]{64}$')

    def test_orchestrator_executable_hash_equals_the_manifest(self):
        self.assertIn("$candSha = '" + self.electron_entry()['sha256'] + "'", self.script)

    def test_orchestrator_candidate_folder_matches_the_manifest_commit(self):
        self.assertIn('candidate-' + self.manifest['native_candidate']['commit'][:7] + '\\node_modules\\electron\\dist\\electron.exe', self.script)

    def test_run_record_final_lines(self):
        self.assertEqual(self.script.count("Rec 'run finished'"), 1)
        self.assertTrue(self.script.rstrip().endswith("Rec 'run finished'"))
        self.assertIn('Rec "run INVALID: ', self.script)
        self.assertNotIn('FAILED:', self.script)


if __name__ == '__main__':
    unittest.main()
