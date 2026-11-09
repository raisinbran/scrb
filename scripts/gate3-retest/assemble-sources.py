"""Assemble constructed units offline, preserving measured boundary uncertainty."""
import argparse
import array
import hashlib
import json
import math
import re
from pathlib import Path
import wave
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import constructed_units as constructed


def normalize_word(text):
    """Compare reference vocabulary without punctuation or case differences."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def place_units(track, clips):
    """Fit whole utterances by distributing gaps instead of leaving a silent tail."""
    choices = {kind: [clip for clip in clips if clip["kind"] == kind] for kind in ("short", "long")}
    assert all(choices.values()), "Both short and long source clips are required"
    assert all(0.3 <= clip["duration"] < 1 for clip in choices["short"]), "Short duration needs review; do not silently time-stretch"
    assert all(4 <= clip["duration"] <= 12 for clip in choices["long"]), "Long duration needs review"
    counters, units = {"short": 0, "long": 0}, []
    offset = 0 if track == "microphone" else 0.25
    windows = [(20+offset, 169, 0.8, 2.5), (170+offset, 245-offset, 0, 0.44),
               (246, 380-offset, 0.8, 2.5)]
    for left, right, minimum, maximum in windows:
        span = right-left
        limits = {kind: int(span/min(clip["duration"] for clip in pool))+1 for kind, pool in choices.items()}
        sums = {}
        for kind, pool in choices.items():
            sums[kind] = [0]
            for index in range(limits[kind]):
                sums[kind].append(sums[kind][-1]+pool[(counters[kind]+index) % len(pool)]["duration"])
        candidates = []
        minimum_shorts = 8 if 170 <= left < 171 else 0
        seen_shorts = sum(unit["short"] for unit in units)
        for long_count in range(1, limits["long"]+1):
            for short_count in range(minimum_shorts, limits["short"]+1):
                count = long_count+short_count
                remaining = span-sums["long"][long_count]-sums["short"][short_count]
                if count > 1 and minimum*(count-1) <= remaining <= maximum*(count-1):
                    gap = remaining/(count-1)
                    fraction = (seen_shorts+short_count)/(len(units)+count)
                    candidates.append((abs(fraction-0.4), abs(gap-(0.15 if minimum == 0 else 1.2)), long_count, short_count, gap))
        assert candidates, "No placement fits the protocol without altering speech"
        _, _, long_count, short_count, gap = min(candidates)
        planned, chosen_shorts = [], 0
        for index in range(long_count+short_count):
            kind = "short" if (index+1)*short_count/(long_count+short_count) > chosen_shorts else "long"
            chosen_shorts += kind == "short"
            planned.append(choices[kind][counters[kind] % len(choices[kind])])
            counters[kind] += 1
        cursor = left
        for clip in planned:
            units.append({"id": f"{track}-{len(units):03}", "track": track, "source": clip["id"],
                          "status": "UNFROZEN",
                          "encoding": clip.get("encoding", "synthetic"), "timing_basis": clip.get("timing_basis", "synthetic metadata"),
                          "start": cursor, "end": cursor+clip["duration"], "short": clip["kind"] == "short",
                          "eligible": None, "eligibility_reason": "pending waveform and listen audit",
                          "words": [{"text": word["text"], "start": cursor+word["start"],
                                     "end": cursor+word["end"]} for word in clip["words"]]})
            cursor += clip["duration"]+gap
    return units


def measure_window_gap(intervals, left, right):
    """Include leading and trailing silence when checking continuous speech."""
    cursor, largest = left, 0
    for start, end in sorted(intervals):
        if end <= left or start >= right:
            continue
        largest = max(largest, max(left, start)-cursor)
        cursor = max(cursor, min(end, right))
    return max(largest, right-cursor)


def assert_track_coverage(units):
    """Reject prospective sources that violate duration, spacing or failure coverage."""
    assert units and units[0]["start"] <= 20.5 and units[-1]["end"] >= 379.5, "Scored span must cover six minutes"
    shorts = [unit for unit in units if unit["short"]]
    fraction = len(shorts)/len(units)
    assert 0.35 <= fraction <= 0.45, "About 40% short units required (draft operational tolerance 35-45%)"
    assert sum(170 <= unit["start"] and unit["end"] <= 245 for unit in shorts) >= 8, "At least eight failure-window short units required"
    words = []
    for index, unit in enumerate(units):
        assert 20-1e-9 <= unit["start"] < unit["end"] <= 380+1e-9
        duration = unit["end"]-unit["start"]
        assert (0.3-1e-9 <= duration < 1) if unit["short"] else (4-1e-9 <= duration <= 12+1e-9)
        assert len(unit["words"]) == 1 if unit["short"] else len(unit["words"]) >= 1
        previous_end = unit["start"]
        for word in unit["words"]:
            assert unit["start"]-1e-9 <= word["start"] < word["end"] <= unit["end"]+1e-9
            assert word["start"] >= previous_end-1e-9, "Overlapping word timings"
            assert normalize_word(word["text"]) not in {"uh", "um", "uhhuh", "okay"}, "Filler requires exclusion before freeze"
            previous_end = word["end"]
            words.append(word)
        if index:
            prior = units[index-1]
            gap = unit["start"]-prior["end"]
            assert gap >= -1e-9, "Same-track overlap"
            if prior["end"] < 170 or unit["start"] > 245:  # gap not wholly inside the failure window
                assert 0.8-1e-9 <= gap <= 2.5+1e-9, "Outside-window gap must be 0.8-2.5 seconds"
    largest = measure_window_gap([(word["start"], word["end"]) for word in words], 170, 245)
    assert largest < 0.5, "Failure-window speech gap is 0.5 seconds or more"
    for index, unit in enumerate(shorts):
        for prior in shorts[:index]:
            if normalize_word(prior["words"][0]["text"]) == normalize_word(unit["words"][0]["text"]):
                assert unit["start"]-prior["start"] >= 30, "Short word repeats within 30 seconds"
    return {"short_fraction": fraction, "failure_window_max_word_gap_seconds": largest,
            "short_mix_tolerance": [0.35, 0.45], "waveform_and_listen_review": "pending"}


def assert_joint_coverage(tracks):
    """Require disjoint vocabularies and at least half the scored time in overlap."""
    vocabularies = [{normalize_word(token) for unit in units for word in unit["words"] for token in word["text"].split()} for units in tracks]
    assert not (vocabularies[0] & vocabularies[1]), "Track vocabularies must be disjoint"
    overlap = 0
    left = right = 0
    spans = [[word for unit in units for word in unit['words']] for units in tracks]
    while left < len(spans[0]) and right < len(spans[1]):
        a, b = spans[0][left], spans[1][right]
        overlap += max(0, min(a["end"], b["end"], 380)-max(a["start"], b["start"], 20))
        if a["end"] <= b["end"]:
            left += 1
        else:
            right += 1
    assert overlap >= 180, "Both tracks must speak together for at least half of 360 seconds"
    return overlap


def assemble_track(track, manifest, measured, root, output, join_samples):
    """Derive one track from immutable units, then verify before annotations."""
    groups = {}
    source_samples = {}
    for unit in manifest['units']:
        if unit['track'] != track:
            continue
        path = root/unit['file']
        if hashlib.sha256(path.read_bytes()).hexdigest() != unit['sha256']:
            raise ValueError('Unit hash mismatch')
        source_samples[unit['unit_id']] = constructed.read_wav(path)
        if len(source_samples[unit['unit_id']]) != unit['samples'] or measured['units'][unit['unit_id']]['source_sha256'] != unit['sha256']:
            raise ValueError('Unit samples or measurement provenance mismatch')
        groups.setdefault(unit['utterance_id'], []).append(unit)
    clips = []
    for key, parts in groups.items():
        result = constructed.construct_utterance(parts, measured['units'], source_samples, join_samples)
        clips.append({**result, 'id': key, 'kind': parts[0]['kind'], 'text': parts[0]['utterance_text'],
                      'duration': len(result['pcm'])/constructed.RATE,
                      'encoding': 'ConstructedUnits', 'timing_basis': 'constructed-sample-offset+unit-energy'})
    units = place_units(track, clips)
    by_id = {clip['id']: clip for clip in clips}
    pcm = array.array('h', [0])*(420*constructed.RATE)
    segments, joins = [], []
    for unit in units:
        clip = by_id[unit['source']]
        origin = round(unit['start']*constructed.RATE)
        unit.update({'last_word_start': origin/constructed.RATE+clip['last_word_start'],
                     'acoustic_end': origin/constructed.RATE+clip['acoustic_end'],
                     'crop_end_bound': (origin+len(clip['pcm']))/constructed.RATE,
                     'earliest_acoustic_end_s': origin/constructed.RATE+clip['earliest_acoustic_end_s'],
                     'latest_acoustic_end_s': origin/constructed.RATE+clip['latest_acoustic_end_s'],
                     'acoustic_end_spread_s': clip['acoustic_end_spread_s'],
                     'final_onset_threshold_spread_s': clip['final_onset_threshold_spread_s'],
                     'threshold_spread_s': clip['threshold_spread_s'], 'frame_resolution_s': clip['frame_resolution_s'],
                     'uncertainty_s': clip['uncertainty_s'], 'timing_basis': clip['timing_basis']})
        unit['reference_text'] = clip['text']
        unit['reference_words'] = clip['text'].split()
        unit['words'] = [{'text': span['text'], 'start': (origin+round(span['start']*constructed.RATE))/constructed.RATE,
                         'end': (origin+round(span['end']*constructed.RATE))/constructed.RATE} for span in clip['words']]
        for segment in clip['segments']:
            segments.append({**segment, 'start': origin+segment['start'], 'end': origin+segment['end']})
        for silence in clip['silences']:
            joins.append({'start': origin+silence['start'], 'end': origin+silence['end'], 'expected_samples': join_samples})
        pcm[origin:origin+len(clip['pcm'])] = clip['pcm']
    coverage = assert_track_coverage(units)
    words = sum(len(by_id[unit['source']]['text'].split()) for unit in units)
    speech = sum(unit['acoustic_end']-unit['words'][0]['start'] for unit in units)
    wpm = constructed.assert_wpm(words, speech)
    frequency = 880 if track == 'microphone' else 1320
    for origin in (1, 381):
        for pulse in range(3):
            start = round((origin+pulse*0.5)*constructed.RATE)
            tone = array.array('h', (round(8000*math.sin(2*math.pi*frequency*i/constructed.RATE)) for i in range(round(0.2*constructed.RATE))))
            pcm[start:start+len(tone)] = tone
            segments.append({'unit_id': 'sync-marker', 'start': start, 'end': start+len(tone), 'sha256': constructed.digest(tone)})
    cursor, silences = 0, []
    for segment in sorted(segments, key=lambda row: row['start']):
        if segment['start'] < cursor:
            raise ValueError('Overlapping segment placements')
        if segment['start'] > cursor:
            silences.append({'start': cursor, 'end': segment['start']})
        cursor = segment['end']
    silences.append({'start': cursor, 'end': len(pcm)})
    verification = constructed.verify_arithmetic(pcm, segments, silences, joins)
    verification['same_method_window_gap_s'] = constructed.assert_window_energy_gap(pcm)
    verification.update({'frame_resolution_s': 0.005, 'waveform_spot_check': 'pending', 'listen_through': 'pending'})
    constructed.write_wav(output/(track+'.wav'), pcm)
    constructed.write_json(output/(track+'-joined-manifest.json'), {'status': 'UNFROZEN', 'file': track+'.wav', 'segments': segments, 'silences': silences, 'joins': joins})
    constructed.write_json(output/(track+'-joined-verification.json'), verification)
    return units, {'track': track, 'wpm_over_acoustic_spans': wpm, 'coverage': coverage,
                   'wav_sha256': hashlib.sha256((output/(track+'.wav')).read_bytes()).hexdigest(),
                   'joined_verification_sha256': hashlib.sha256((output/(track+'-joined-verification.json')).read_bytes()).hexdigest()}


def main():
    """Write UNFROZEN annotations only after both track checks pass."""
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('measurements', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--join-ms', type=float, default=40)
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    tracks, reports = [], []
    try:
        manifest, measured = constructed.read_json(args.manifest), constructed.read_json(args.measurements)
        if manifest['method'] != 'ConstructedUnits' or measured['unit_manifest_sha256'] != hashlib.sha256(args.manifest.read_bytes()).hexdigest():
            raise ValueError('Constructed unit/measurement manifest mismatch')
        join_samples = round(args.join_ms*constructed.RATE/1000)
        if abs(join_samples/constructed.RATE-args.join_ms/1000) > 1e-12:
            raise ValueError('Join must resolve to exact source samples')
        for track in ('microphone', 'meeting'):
            units, report = assemble_track(track, manifest, measured, args.manifest.parent, args.output, join_samples)
            tracks.append(units); reports.append(report)
        overlap = assert_joint_coverage(tracks)
        for track, units in zip(('microphone', 'meeting'), tracks):
            annotations = []
            for unit in units:
                row = {**unit, 'crop_start': unit['start'], 'crop_start_sample': round(unit['start']*constructed.RATE),
                       'start': unit['words'][0]['start'], 'reference_spans': unit['words']}
                row.pop('words'); row.pop('end')
                for field in ('start', 'last_word_start', 'acoustic_end', 'crop_end_bound'):
                    row[field+'_sample'] = round(row[field]*constructed.RATE)
                    row[field] = row[field+'_sample']/constructed.RATE
                for field in ('earliest_acoustic_end', 'latest_acoustic_end'):
                    row[field+'_sample'] = round(row[field+'_s']*constructed.RATE)
                    row[field+'_s'] = row[field+'_sample']/constructed.RATE
                annotations.append(row)
            constructed.write_json(args.output/(track+'-annotations.json'), {'status': 'UNFROZEN', 'sample_rate': constructed.RATE, 'utterances': annotations})
        constructed.write_json(args.output/'source-audit.json', {'status': 'UNFROZEN', 'tracks': reports, 'overlap_seconds': overlap,
                               'join_ms': args.join_ms, 'timing_basis': 'constructed-sample-offset+unit-energy',
                               'waveform_spot_check': 'pending', 'listen_through': 'pending',
                               'assembly_script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
    except Exception as error:
        constructed.write_json(args.output/'assembly-failure.json', {'status': 'UNFROZEN', 'error': str(error), 'completed': reports})
        raise


if __name__ == '__main__':
    main()
