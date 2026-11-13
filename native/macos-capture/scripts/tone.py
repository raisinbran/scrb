"""Shared by the macOS capture scripts: how to start afplay for the test tone.

SCRB_TEST_TONE_FILE replaces the tone file (only where override=True: scripts that need just some sound).
SCRB_TEST_TONE_VOLUME sets afplay -v (0 to 1). With a replacement file and no volume, -v 0.3 is used.
With neither variable set the command is exactly the one the script used before (default_volume if given).
"""
import os
import subprocess


def tone_command(file, override=False, default_volume=None, env=os.environ):
    replaced = env.get("SCRB_TEST_TONE_FILE") if override else None
    volume = env.get("SCRB_TEST_TONE_VOLUME") or ("0.3" if replaced else default_volume)
    return ["afplay"] + (["-v", str(volume)] if volume else []) + [replaced or file]


def play_tone(file, override=False, default_volume=None):
    return subprocess.Popen(tone_command(file, override, default_volume))
