"""DRAFT, NOT FROZEN: derive the scorer's source-annotation inventory from the r3 source pack, mechanically.

Reads only frozen-pack inputs (the UNFROZEN assembly annotations and joined manifest, the measurement file, the owner
sign-off, the playback log) plus the protocol amendments in docs/gates. Writes new files; edits nothing.
Every field carries the protocol section it comes from; anything the protocol text does not fix is listed in
`decisions_needed` and is NOT guessed. The output has frozen=false: the scorer needs frozen=true, and only the owner
freezes. A dry run may set the flag on a COPY (see the dry-run script), never here.

  python make-draft-annotations.py --assembly DIR --measurements FILE --signoff FILE --playback-log FILE --out DIR
"""
import argparse
import hashlib
import json
import re
import sys
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ONSET_SPREAD_LIMIT_S = 0.025   # v3 timing amendment, revision 2026-11-09 (spread policy)
OFFSET_SPREAD_LIMIT_S = 0.100  # same revision
# D1 provenance. The recorded hash is the git blob bytes (LF) of the sign-off file at commit cb26f9c04b58 (preflight manifest,
# owner_listen_through.evidence_file_sha256); a Windows checkout may hold CRLF, so the content is hashed with CRLF folded to LF.
SIGNOFF_SHA256 = "5a8fb52b928b18a2a0f70c632122763159cec5c4ae18b70ce997418bbf747e87"
# Units the sign-off excludes from the listen-through, by id. The audit and the sign-off text record none. If the sign-off ever
# names exclusions, this list must name the same units, or the script refuses to run.
SIGNOFF_EXCLUDED_UNIT_IDS = ()
EXCLUSION_WORDS = re.compile(r"exclu|except|omit|skipp|not (?:heard|listened|included|reviewed|checked)|unheard|ineligible|remov", re.I)
MARKER_HZ = {"microphone": 880, "meeting": 1320}  # marker_clock.analyze_v3a; v3 amendment unchanged marker check

SOURCES = {
    "sample_rate": "v3 timing amendment, section 1 (join arithmetic at the source sample rate) and Freeze Manifest item 3; value read from the assembly file",
    "source_sha256": "v3 timing amendment, Freeze Manifest item 3 (record both source WAV hashes); cross-checked against the playback log 'files' event",
    "utterances.id/short": "v3 timing amendment, section 1 (short = one-word final-word unit; Revision (d) short fraction); copied from the assembly annotations",
    "utterances.source_start_sample/source_end_sample": "v3 timing amendment, Freeze Manifest item 3 (exact sample indices; traceable to exact cropped segments): first prefix/final-unit segment start to last segment end in the joined manifest",
    "utterances.eligible": "v3 timing amendment, section 2 and Revision 2026-11-09 (spread policy: onset spread <= 25 ms, offset spread <= 100 ms; no output-driven denominator change); r3 listen-through sign-off; joined-file verification. MECHANICAL PART ONLY, see decisions D1 and D2",
    "searches": "v3a amendment, section 4 rule 3 and 7 and scorer README: every non-short utterance in inventory order, ids only",
    "utterances.start/last_word_start/acoustic_end/earliest_acoustic_end_s/latest_acoustic_end_s/reference_words": "v3 timing amendment, section 1 and Revision 2026-11-09 (earliest = earlier offset - 5 ms, latest = later offset + 5 ms); copied unchanged from the assembly annotations",
    "scored_unit_fields": "scorer glue (v3a_timing.source_schedule): source_start_s = start, source_last_word_start_s = last_word_start, source_last_word_end_s = acoustic_end (the nominal primary endpoint, v3 amendment section 1); the annotation spread fields (earliest/latest acoustic end, threshold spreads) are copied unchanged and the scorer glue (v3a_timing.attach_source_spread) takes them from the frozen annotation (D6)",
    "markers_in_source": "v3 amendment marker check as carried by v3a amendment section 4 rule 1; detected in the frozen source by marker_clock.detect_marker windows (0,10) and (380,390)",
}

DECISIONS = [
    {"id": "D1", "need": "Definition of `eligible` (what counts in the frozen denominator). The original Protocol v3 text is not in this repository; the amendments only say the denominator is frozen and may not change on output. This script marks a unit eligible when every mechanical source check passes. Is that the denominator (all 65/75 units, shorts included), or are some units excluded (for example by window or by marker overlap)?", "from": "owner or ChatGPT"},
    {"id": "D2", "need": "Waveform spot-check scope. The amendment requires a waveform spot-check before annotations leave UNFROZEN; the retained check covers 12 clips. Does that satisfy the requirement for every unit's eligibility?", "from": "owner or ChatGPT"},
    {"id": "D3", "need": "Harness marker times for the 100 ms marker check (`harness`, `harness_u`). The protocol text does not say where they come from. The playback log of validation-3 has start and stop ticks only, no marker events. This draft offers the SOURCE marker positions (detected in the frozen file) as a stand-in; that tests recording drift against the source clock, not against an independent playback measurement.", "from": "owner or ChatGPT"},
    {"id": "D4", "need": "Long-anchor matcher. The scorer defaults to bounded correlation (long_correlation.py); its docstring says correlation peaks have no approved calibration, and exact PCM matching cannot work across Opus. Which method is approved, with which settings?", "from": "owner or ChatGPT"},
    {"id": "D5", "need": "The lead marker as first anchor is a marked proposal in v3a amendment section 4 rule 7, not an approval. Use it for this retest?", "from": "owner"},
    {"id": "D6", "need": "Source acoustic-end spread. The scorer places one nominal endpoint (source_last_word_end_s) and widens it only by the anchor uncertainty; the 5-100 ms source spread of the annotation (earliest/latest acoustic end) is not carried into the v3a intervals. Policy says conservative uses the earliest and best case the latest acoustic end. Which values go into the scored units, and should the scorer carry the spread?", "from": "owner or ChatGPT"},
    {"id": "D7", "need": "Freeze itself: this file is a draft with frozen=false. The record needs the owner's freeze, hashes, and the approved answers to D1 to D6.", "from": "owner"},
]


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bind_signoff(path):
    """The sign-off must be the recorded content (hash), and any exclusion it states must be listed here, none unlisted."""
    raw = Path(path).read_bytes()
    folded = raw.replace(b"\r\n", b"\n")
    got = hashlib.sha256(folded).hexdigest()
    if got != SIGNOFF_SHA256:
        raise SystemExit("sign-off content hash %s differs from the recorded %s" % (got, SIGNOFF_SHA256))
    # Only the owner's quoted text and the scope line are examined for exclusion language.
    lines = [line for line in folded.decode("utf-8").splitlines() if line.startswith(">") or line.startswith("Scope:")]
    stated = [line for line in lines if EXCLUSION_WORDS.search(line)]
    if stated and not SIGNOFF_EXCLUDED_UNIT_IDS:
        raise SystemExit("the sign-off text mentions exclusions that this script does not list: %r" % stated)
    return {"signoff_content_sha256": got, "signoff_raw_file_sha256": hashlib.sha256(raw).hexdigest(),
            "recorded_sha256": SIGNOFF_SHA256, "hash_method": "git-blob-bytes (CRLF folded to LF)",
            "stated_exclusions": stated, "listed_excluded_unit_ids": list(SIGNOFF_EXCLUDED_UNIT_IDS)}


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def build_track(track, assembly, measurements, signoff_ok, log_hashes):
    wav_path = assembly / (track + ".wav")
    annotations = load(assembly / (track + "-annotations.json"))
    manifest = load(assembly / (track + "-joined-manifest.json"))
    verification = load(assembly / (track + "-joined-verification.json"))
    with wave.open(str(wav_path), "rb") as stream:
        rate, frames = stream.getframerate(), stream.getnframes()
        assert stream.getnchannels() == 1 and stream.getsampwidth() == 2, "source must be mono PCM16"
    assert rate == annotations["sample_rate"], "annotation sample rate differs from the WAV"
    source_sha = sha256_file(wav_path)
    if log_hashes.get(track):
        assert log_hashes[track] == source_sha, "source WAV hash differs from the playback log"
    verified = verification.get("arithmetic_consistency") == "PASS"
    segments = [s for s in manifest["segments"] if s["unit_id"] != "sync-marker"]
    utterances, previous_end = [], 0
    for unit in annotations["utterances"]:
        mine = [s for s in segments if s["unit_id"].startswith(unit["source"] + "-u")
                and unit["crop_start_sample"] <= s["start"] and s["end"] <= unit["crop_end_bound_sample"]]
        assert mine, "no joined segment for " + unit["id"]
        start, end = min(s["start"] for s in mine), max(s["end"] for s in mine)
        assert (start, end) == (unit["crop_start_sample"], unit["crop_end_bound_sample"]), "segments differ from the annotation crop for " + unit["id"]
        assert previous_end <= start < end <= frames, "overlapping or out-of-range segment for " + unit["id"]
        previous_end = end
        checks, reasons = [], []
        for s in mine:
            m = measurements["units"].get(s["unit_id"])
            if m is None:
                reasons.append("no measurement for " + s["unit_id"])
                continue
            if m["onset_threshold_spread_s"] > ONSET_SPREAD_LIMIT_S + 1e-12:
                reasons.append("%s onset spread %.3f s" % (s["unit_id"], m["onset_threshold_spread_s"]))
            if m["offset_threshold_spread_s"] > OFFSET_SPREAD_LIMIT_S + 1e-12:
                reasons.append("%s offset spread %.3f s" % (s["unit_id"], m["offset_threshold_spread_s"]))
            checks.append(s["unit_id"])
        if not verified:
            reasons.append("joined-file verification not passed")
        if not signoff_ok:
            reasons.append("listen-through sign-off file missing")
        if unit["id"] in SIGNOFF_EXCLUDED_UNIT_IDS:
            reasons.append("excluded by the listen-through sign-off")
        row = {k: unit[k] for k in ("id", "track", "source", "short", "reference_words", "start", "last_word_start", "acoustic_end",
                                    "earliest_acoustic_end_s", "latest_acoustic_end_s", "acoustic_end_spread_s", "threshold_spread_s",
                                    "final_onset_threshold_spread_s") if k in unit}
        row.update(source_start_sample=start, source_end_sample=end, eligible=not reasons, eligibility_failures=reasons,
                   measured_units=checks, source_start_s=unit["start"], source_last_word_start_s=unit["last_word_start"],
                   source_last_word_end_s=unit["acoustic_end"])
        utterances.append(row)
    longs = [u for u in utterances if not u["short"]]
    return {"status": "DRAFT - NOT FROZEN", "frozen": False, "track": track, "sample_rate": rate, "source_sha256": source_sha,
            "source_samples": frames, "joined_verification_passed": verified,
            "stale_pending_flags_in_joined_verification": {k: verification.get(k) for k in ("waveform_spot_check", "listen_through")}, "utterances": utterances,
            "searches": [{"id": u["id"]} for u in longs],
            "counts": {"utterances": len(utterances), "long": len(longs), "short": len(utterances) - len(longs),
                       "eligible": sum(u["eligible"] for u in utterances)},
            "provenance": SOURCES, "decisions_needed": DECISIONS}


def source_markers(track, assembly):
    import marker_clock
    import v3a_timing
    samples, rate = v3a_timing.pcm16(str(assembly / (track + ".wav")))
    freq = MARKER_HZ[track]
    return {"lead": marker_clock.detect_marker(samples, rate, freq, (0, 10)),
            "trail": marker_clock.detect_marker(samples, rate, freq, (380, 390)), "basis": SOURCES["markers_in_source"]}


def main():
    parser = argparse.ArgumentParser()
    for name in ("assembly", "measurements", "signoff", "playback-log", "out"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    measurements = load(args.measurements)
    log = {}
    for line in args.playback_log.read_text(encoding="utf-8-sig").splitlines():
        if line.strip():
            event = json.loads(line)
            if event.get("event") == "files":
                log = {"microphone": event["data"].get("microphone_sha256"), "meeting": event["data"].get("meeting_sha256")}
    binding = bind_signoff(args.signoff)
    args.out.mkdir(parents=True, exist_ok=True)
    for track in ("microphone", "meeting"):
        document = build_track(track, args.assembly, measurements, args.signoff.is_file(), log)
        document["inputs"] = {"annotations_sha256": sha256_file(args.assembly / (track + "-annotations.json")),
                              "joined_manifest_sha256": sha256_file(args.assembly / (track + "-joined-manifest.json")),
                              "measurements_sha256": sha256_file(args.measurements), "signoff_sha256": binding["signoff_content_sha256"],
                              "signoff_binding": binding}
        document["markers_in_source"] = source_markers(track, args.assembly)
        target = args.out / (track + "-source-annotations-DRAFT.json")
        with target.open("x", encoding="utf-8") as stream:
            json.dump(document, stream, indent=1)
        print(track, target.name, document["counts"], "markers", round(document["markers_in_source"]["lead"]["position"], 3),
              round(document["markers_in_source"]["trail"]["position"], 3))


if __name__ == "__main__":
    main()
