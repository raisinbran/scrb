"""D1: the draft-annotation script binds the sign-off's content hash and reconciles explicit exclusions."""
import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('make_draft_annotations', HERE/'make-draft-annotations.py')
draft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(draft)

SIGNOFF = HERE.parents[1]/'docs'/'gates'/'gate-3-windows-r3-listen-through-signoff-20261108.md'
RECORDED = '5a8fb52b928b18a2a0f70c632122763159cec5c4ae18b70ce997418bbf747e87'


def write(directory, data):
    path = Path(directory)/'signoff.md'
    path.write_bytes(data)
    return path


class SignoffBinding(unittest.TestCase):
    def test_the_recorded_hash_is_the_one_in_the_manifest(self):
        self.assertEqual(draft.SIGNOFF_SHA256, RECORDED)

    def test_the_repository_signoff_matches_with_either_line_ending(self):
        text = SIGNOFF.read_bytes().replace(b'\r\n', b'\n')
        with tempfile.TemporaryDirectory() as directory:
            for data in (text, text.replace(b'\n', b'\r\n')):
                result = draft.bind_signoff(write(directory, data))
                self.assertEqual(result['signoff_content_sha256'], RECORDED)
                self.assertEqual(result['stated_exclusions'], [])
                self.assertEqual(result['listed_excluded_unit_ids'], [])

    def test_a_changed_signoff_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(SystemExit, 'differs from the recorded'):
                draft.bind_signoff(write(directory, SIGNOFF.read_bytes() + b'\nExtra line.\n'))

    def test_a_missing_signoff_is_refused(self):
        with self.assertRaises(OSError):
            draft.bind_signoff(HERE/'does-not-exist.md')

    def test_an_exclusion_the_script_does_not_list_is_refused(self):
        changed = SIGNOFF.read_bytes().replace(b'\r\n', b'\n').replace(
            b'I heard no clipped', b'I excluded meeting-044 because I did not listen to it. I heard no clipped')
        with tempfile.TemporaryDirectory() as directory, patch.object(draft, 'SIGNOFF_SHA256', hashlib.sha256(changed).hexdigest()):
            with self.assertRaisesRegex(SystemExit, 'exclusions that this script does not list'):
                draft.bind_signoff(write(directory, changed))

    def test_a_listed_exclusion_is_accepted_and_reported(self):
        changed = SIGNOFF.read_bytes().replace(b'\r\n', b'\n').replace(
            b'I heard no clipped', b'I excluded meeting-044 because I did not listen to it. I heard no clipped')
        with tempfile.TemporaryDirectory() as directory, patch.object(draft, 'SIGNOFF_SHA256', hashlib.sha256(changed).hexdigest()), \
                patch.object(draft, 'SIGNOFF_EXCLUDED_UNIT_IDS', ('meeting-044',)):
            result = draft.bind_signoff(write(directory, changed))
        self.assertEqual(result['listed_excluded_unit_ids'], ['meeting-044'])
        self.assertTrue(result['stated_exclusions'])


if __name__ == '__main__':
    unittest.main()
