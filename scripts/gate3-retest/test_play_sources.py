import json
import pathlib
import shutil
import subprocess
import sys
import unittest

SCRIPT = pathlib.Path(__file__).with_name('play-sources.ps1')
POWERSHELL = shutil.which('powershell.exe') if sys.platform == 'win32' else None


class StaticChecks(unittest.TestCase):
    """Run on any OS: inspect the script text."""

    def setUp(self):
        self.text = SCRIPT.read_text(encoding='utf-8')

    def test_refuses_16ch_and_defaults_to_dry_run(self):
        self.assertIn("-notlike '*16ch*'", self.text)
        self.assertIn('if (-not $Play)', self.text)
        self.assertLess(self.text.index('if (-not $Play)'), self.text.index('[Mm]::Open('))

    def test_no_resampling_or_time_stretching(self):
        lowered = self.text.lower()
        for word in ('resample', 'ffmpeg', 'sox', 'atempo'):
            self.assertNotIn(word, lowered)

    def test_requires_hashes_and_new_folder(self):
        self.assertIn('Assert-Hash', self.text)
        self.assertIn('OutFolder already exists', self.text)

    def test_no_audio_settings_changes(self):
        for word in ('SetDefaultEndpoint', 'SetEndpointVisibility', 'SetMasterVolume', 'Set-AudioDevice'):
            self.assertNotIn(word, self.text)


@unittest.skipUnless(POWERSHELL, 'needs Windows PowerShell')
class SelfTest(unittest.TestCase):
    def test_hardware_free_logic(self):
        out = subprocess.run([POWERSHELL, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(SCRIPT), '-SelfTest'],
                             capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr)
        result = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertEqual(result['mic_selected'], 'CABLE Input (VB-Audio Virtual C')
        self.assertEqual(result['wav_samples'], 2)
        for key, value in result.items():
            if key not in ('mic_selected', 'system_selected', 'wav_samples'):
                self.assertTrue(value, key)


if __name__ == '__main__':
    unittest.main()
