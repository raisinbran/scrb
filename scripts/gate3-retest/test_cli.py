"""Check isolated-Python entry points without reading audio or creating output."""
from pathlib import Path
import subprocess
import sys
import unittest


class TestIsolatedEntryPoints(unittest.TestCase):
    """Cover the actual isolated runtime that omitted sibling module imports."""

    def test_help_loads_sibling_modules(self):
        """Load every processing CLI under isolated Python.

        Unittest discovery added a search path that direct script execution lacked.
        """
        for name in ('measure-units.py', 'assemble-sources.py', 'verify-joined.py'):
            with self.subTest(script=name):
                result = subprocess.run([sys.executable, '-I', '-S', str(Path(__file__).with_name(name)), '--help'],
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('usage:', result.stdout)
