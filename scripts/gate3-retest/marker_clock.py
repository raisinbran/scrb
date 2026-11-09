"""Detect existing three-pulse sync tones in PCM16 recordings and fit clocks."""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import sys
import re
import wave
import subprocess


def detect_marker(samples, rate, frequency, window, scored=(20, 380)):
    """Require exactly one complete tone pattern outside the scored interval.

    Five-millisecond spectral frames bound onset quantization; pattern tolerance
    admits clock drift and frame rounding, not an alternative speech endpoint.
    """
    left, right = window
    if not (0 <= left < right <= len(samples)/rate
            and (right <= scored[0] or left >= scored[1])):
        raise ValueError("Marker search window must be outside the scored interval")
    if not 0 < frequency < rate/2:
        raise ValueError("Marker frequency must be below Nyquist")
    frame = max(1, round(rate*0.005))
    step = frame/rate
    runs = []
    active = None
    begin, finish = math.ceil(left*rate), math.floor(right*rate)
    for start in range(begin, finish-frame+1, frame):
        block = samples[start:start+frame]
        energy = sum(value*value for value in block)
        real = sum(value*math.cos(2*math.pi*frequency*i/rate) for i, value in enumerate(block))
        imag = sum(value*math.sin(2*math.pi*frequency*i/rate) for i, value in enumerate(block))
        purity = 2*(real*real+imag*imag)/(frame*energy) if energy else 0
        tone = energy/frame >= (0.02*32768)**2 and purity >= 0.8
        if tone and active is None:
            active = start/rate
        if not tone and active is not None:
            runs.append((active, start/rate))
            active = None
    if active is not None:
        runs.append((active, finish/rate))
    patterns = []
    for index in range(len(runs)-2):
        triple = runs[index:index+3]
        if (all(abs(end-start-0.2) <= 0.02 for start, end in triple)
                and all(abs(triple[j+1][0]-triple[j][0]-0.5) <= 0.02 for j in (0, 1))):
            onset = triple[0][0]
            if onset-step < left or triple[-1][1]+step > right:
                continue
            patterns.append({"position": onset, "uncertainty_s": step,
                             "onset_bounds": [onset-step, onset+step], "pulses": triple})
    if len(patterns) != 1:
        raise ValueError(f"Marker {'missing' if not patterns else 'ambiguous'} in {window}: {len(patterns)} candidates")
    return patterns[0]


def fit_markers(lead, trail, harness, harness_u=(0, 0)):
    """Fit affine time and propagate marker and harness interval uncertainty."""
    r0, r1 = lead["position"], trail["position"]
    u0, u1 = lead["uncertainty_s"], trail["uncertainty_s"]
    h0, h1 = harness
    v0, v1 = harness_u
    if not all(math.isfinite(value) for value in (r0, r1, u0, u1, h0, h1, v0, v1)):
        raise ValueError("Nonfinite clock anchor")
    if min(u0, u1, v0, v1) < 0 or r1-r0 <= u0+u1 or h1-h0 <= v0+v1:
        raise ValueError("Invalid clock anchor order or uncertainty")
    slope = (h1-h0)/(r1-r0)
    offsets = []
    slopes = []
    for a in (r0-u0, r0+u0):
        for b in (r1-u1, r1+u1):
            for c in (h0-v0, h0+v0):
                for d in (h1-v1, h1+v1):
                    scale = (d-c)/(b-a)
                    slopes.append(scale)
                    offsets.append(c-scale*a)
    disagreement = abs((h1-r1)-(h0-r0))
    valid = disagreement+u0+u1+v0+v1 <= 0.1
    return {"offset": h0-slope*r0, "slope": slope, "drift_ppm": (slope-1)*1e6,
            "offset_bounds": [min(offsets), max(offsets)],
            "slope_bounds": [min(slopes), max(slopes)],
            "offset_disagreement_seconds": disagreement,
            "anchor_uncertainty_s": [u0+v0, u1+v1],
            "valid": valid, "latency": "READY_FOR_ALIGNMENT" if valid else "INCONCLUSIVE",
            "uncertainty_note": "Interval bounds cover detection quantization and supplied harness uncertainty; two anchors cannot test nonlinear clock drift."}


def analyze_recording(path, track, harness, channel=0, harness_u=(0, 0)):
    """Read one explicit PCM16 channel and detect both existing source markers."""
    identity = {"track": track, "recording_sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                "channel": channel}
    with wave.open(str(path), "rb") as stream:
        if stream.getsampwidth() != 2 or stream.getcomptype() != "NONE":
            raise ValueError("Only uncompressed PCM16 recordings are supported")
        channels = stream.getnchannels()
        if not 0 <= channel < channels:
            raise ValueError("Invalid recording channel")
        rate = stream.getframerate()
        identity["sample_rate"] = rate
        pcm = array.array("h", stream.readframes(stream.getnframes()))
    if sys.byteorder != "little":
        pcm.byteswap()
    samples = pcm[channel::channels]
    frequency = {"microphone": 880, "meeting": 1320}[track]
    try:
        lead = detect_marker(samples, rate, frequency, (0, 10))
        trail = detect_marker(samples, rate, frequency, (380, 390))
        fit = fit_markers(lead, trail, harness, harness_u)
    except ValueError as error:
        return {**identity, "valid": False, "latency": "INCONCLUSIVE", "error": str(error)}
    return {**identity, **fit, "lead": lead, "trail": trail}


def map_publications(publications, clock, *, track, recording_sha256):
    """Map observer intervals to recording time without moving scored windows."""
    if clock.get("track") != track:
        raise ValueError("Marker clock track mismatch")
    if (not isinstance(recording_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", recording_sha256)
            or clock.get("recording_sha256") != recording_sha256):
        raise ValueError("Marker clock recording identity missing or mismatched")
    if clock.get("valid") is not True:
        raise ValueError("Invalid marker clock; latency is INCONCLUSIVE")
    low_slope, high_slope = clock["slope_bounds"]
    low_offset, high_offset = clock["offset_bounds"]

    if (not all(math.isfinite(value) for value in
                (low_slope, high_slope, low_offset, high_offset, clock["slope"], clock["offset"]))
            or not 0 < low_slope <= clock["slope"] <= high_slope
            or not low_offset <= clock["offset"] <= high_offset):
        raise ValueError("Invalid marker clock fit bounds; latency is INCONCLUSIVE")
    words = []
    for publication in publications:
        values = [(time-offset)/scale
                  for time in (publication["observed"]-publication["u"], publication["observed"])
                  for scale in (low_slope, high_slope) for offset in (low_offset, high_offset)]
        row = {**publication, "observed": max(values), "u": max(values)-min(values),
               "observed_nominal": (publication["observed"]-clock["offset"])/clock["slope"]}
        words.append(row)
    return words


def check_continuous_markers(lead, trail, harness, harness_u=(0, 0)):
    """Apply the 100 ms rule without an affine correction in Protocol v3a."""
    values = [lead['position'], trail['position'], *harness,
              lead['uncertainty_s'], trail['uncertainty_s'], *harness_u]
    if (not all(math.isfinite(v) for v in values)
            or min(values[4:]) < 0 or values[1] <= values[0] or harness[1] <= harness[0]):
        raise ValueError('Invalid v3a clock anchors')
    offsets = [harness[i]-marker['position'] for i, marker in enumerate((lead, trail))]
    uncertainty = [lead['uncertainty_s']+harness_u[0], trail['uncertainty_s']+harness_u[1]]
    disagreement = abs(offsets[1]-offsets[0])
    valid = disagreement+sum(uncertainty) <= 0.1
    return {'mode': 'v3a', 'valid': valid,
            'latency': 'READY_FOR_ALIGNMENT' if valid else 'INCONCLUSIVE',
            'offset_disagreement_seconds': disagreement, 'anchor_uncertainty_s': uncertainty,
            'offset_bounds': [min(o-u for o, u in zip(offsets, uncertainty)),
                              max(o+u for o, u in zip(offsets, uncertainty))],
            'mapping': 'translation interval only; no affine clock correction',
            'lead': lead, 'trail': trail}


def analyze_v3a(metadata, decoder, track, harness, harness_u=(0, 0), *, views=None):
    """Report both derived views of the same preserved chunks, without audio output."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from v3a_timing import load_views
    try:
        continuous, timestamped, mapping = load_views(metadata, decoder, track) if views is None else views
        rate = mapping['rate']
        frequency = {'microphone': 880, 'meeting': 1320}[track]
        def markers(samples):
            return (detect_marker(samples, rate, frequency, (0, 10)),
                    detect_marker(samples, rate, frequency, (380, 390)))
        def report(samples, original):
            try:
                lead, trail = markers(samples)
                check = fit_markers if original else check_continuous_markers
                return {**check(lead, trail, harness, harness_u), 'lead': lead, 'trail': trail}
            except ValueError as error:
                return {'valid': False, 'latency': 'INCONCLUSIVE', 'error': str(error)}
        original = report(timestamped, True)
        amended = report(continuous, False)
        valid = mapping['valid'] and amended['valid']
        if not mapping['valid']:
            original['view_basis'] = mapping['original_view_basis']
        return {'mode': 'v3a', 'track': track, 'valid': valid,
                'latency': 'READY_FOR_ALIGNMENT' if valid else 'INCONCLUSIVE', 'gap_map': mapping,
                'sample_continuous': amended, 'original_timestamped': original}
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as error:
        return {'mode': 'v3a', 'track': track, 'valid': False, 'latency': 'INCONCLUSIVE',
                'gap_map': {'valid': False, 'error': str(error)},
                'sample_continuous': {'valid': False, 'latency': 'INCONCLUSIVE'},
                'original_timestamped': {'valid': False, 'latency': 'INCONCLUSIVE',
                                         'error': 'Cannot derive a validated timestamped view: '+str(error)}}


def main():
    """Write a new clock report and signal invalid synchronization to the caller."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--track", choices=("microphone", "meeting"), required=True)
    parser.add_argument("--harness", type=float, nargs=2, required=True)
    parser.add_argument("--harness-u", type=float, nargs=2, default=(0, 0))
    parser.add_argument("--channel", type=int, default=0)
    parser.add_argument('--mode', choices=('v3', 'v3a'), default='v3')
    parser.add_argument('--decoder', type=Path, help='v3a only: explicit offline ffmpeg path; recording is chunks.json')
    args = parser.parse_args()
    if args.mode == 'v3a':
        if args.decoder is None or args.channel != 0:
            parser.error('v3a requires --decoder and native mono channel 0')
        result = analyze_v3a(args.recording, args.decoder, args.track, args.harness, args.harness_u)
    else:
        result = analyze_recording(args.recording, args.track, args.harness, args.channel, args.harness_u)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
        stream.write("\n")
    if not result["valid"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
