"""Measure constructed source units and check derived sample arithmetic offline."""
import array
import hashlib
import json
import math
from pathlib import Path
import wave

RATE = 24000
FRAME = 120
VAD_SILENCE_S = 0.300
JOIN_LIMIT_S = VAD_SILENCE_S-0.020


def reject_engine_timing(value):
    """Reject legacy timing fields before any constructed input is consumed."""
    if isinstance(value, dict):
        for key, item in value.items():
            if 'mark' in key.lower() or 'audioposition' in key.lower():
                raise ValueError('Engine timing forbidden in ConstructedUnits')
            reject_engine_timing(item)
    elif isinstance(value, list):
        for item in value:
            reject_engine_timing(item)
    elif isinstance(value, str) and ('audioposition' in value.lower() or '<mark' in value.lower()):
        raise ValueError('Engine timing forbidden in ConstructedUnits')


def read_json(path):
    """Read constructed metadata and reject engine timing recursively."""
    value = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    reject_engine_timing(value)
    return value


def write_json(path, value):
    """Keep every previous derived output intact."""
    with Path(path).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write('\n')


def digest(samples):
    """Hash PCM16 sample bytes, separately from whole-file provenance."""
    return hashlib.sha256(array.array('h', samples).tobytes()).hexdigest()


def read_wav(path):
    """Load an explicitly supplied unit or derived mono PCM16 WAV."""
    with wave.open(str(path), 'rb') as stream:
        if (stream.getnchannels(), stream.getsampwidth(), stream.getframerate()) != (1, 2, RATE):
            raise ValueError('Expected mono PCM16 at 24000 Hz')
        data = array.array('h')
        data.frombytes(stream.readframes(stream.getnframes()))
        return data


def write_wav(path, samples):
    """Write a new derived WAV without replacing source evidence."""
    with Path(path).open('xb') as raw:
        with wave.open(raw, 'wb') as stream:
            stream.setparams((1, 2, RATE, len(samples), 'NONE', 'not compressed'))
            stream.writeframes(array.array('h', samples).tobytes())


def energy_edges(samples, threshold):
    """Quantize energy edges to five-millisecond frame boundaries."""
    rms = [math.sqrt(sum(v*v for v in samples[i:i+FRAME])/len(samples[i:i+FRAME]))
           for i in range(0, len(samples), FRAME)]
    level = max(128, max(rms, default=0)*0.03) if threshold is None else threshold
    active = [i for i, value in enumerate(rms) if value >= level]
    if not active:
        raise ValueError('Acoustically invalid unit: no active frame')
    if active[0] == 0 or active[-1] == len(rms)-1:
        raise ValueError('Clipped unit: energy reaches first or last frame')
    return active[0]*FRAME, min((active[-1]+1)*FRAME, len(samples))


def measure(samples):
    """Record two-threshold edge spread and conservative boundary uncertainty."""
    onset, offset = energy_edges(samples, None)
    second_onset, second_offset = energy_edges(samples, 184)
    onset_spread = abs(onset-second_onset)/RATE
    offset_spread = abs(offset-second_offset)/RATE
    if max(onset_spread, offset_spread) > 0.025+1e-12:
        raise ValueError('Threshold spread exceeds 25 ms')
    left, right = onset-round(0.020*RATE), offset+round(0.030*RATE)
    if not 0 <= left < right <= len(samples):
        raise ValueError('Crop padding would clip the unit')
    return {'onset': onset, 'offset': offset, 'secondary_onset': second_onset,
            'secondary_offset': second_offset, 'crop_start': left, 'crop_end': right,
            'lead_samples': onset, 'trail_samples': len(samples)-offset,
            'onset_threshold_spread_s': onset_spread, 'offset_threshold_spread_s': offset_spread,
            'threshold_spread_s': max(onset_spread, offset_spread), 'frame_resolution_s': FRAME/RATE,
            'uncertainty_s': offset_spread+FRAME/RATE}


def assert_join(previous, following, zeros):
    """Compare effective near-silence in seconds with the candidate's VAD split."""
    if zeros < 0 or int(zeros) != zeros:
        raise ValueError('Join must have a nonnegative exact sample count')
    gap = ((previous['crop_end']-previous['offset'])+zeros+
           (following['onset']-following['crop_start']))/RATE
    if gap >= JOIN_LIMIT_S:
        raise ValueError('Effective join gap reaches VAD silence minus 20 ms')
    return gap


def assert_wpm(word_count, speech_seconds):
    """Check track rate over acoustic spans, including intra-utterance joins."""
    value = 60*word_count/speech_seconds if speech_seconds > 0 else math.inf
    if not 130 <= value <= 170:
        raise ValueError('Constructed speech rate outside 130-170 wpm')
    return value


def construct_utterance(parts, measurements, samples, join_samples=960):
    """Join one optional prefix and one final unit using measured sample edges."""
    roles = [part['role'] for part in parts]
    if roles not in (['final'], ['prefix', 'final']):
        raise ValueError('Expected one optional prefix plus one final-word unit')
    output, segments, silences, spans = array.array('h'), [], [], []
    for index, part in enumerate(parts):
        key = part['unit_id']; timing = measurements[key]
        if index:
            assert_join(measurements[parts[index-1]['unit_id']], timing, join_samples)
            start = len(output); output.extend([0]*join_samples)
            silences.append({'start': start, 'end': len(output)})
        crop = samples[key][timing['crop_start']:timing['crop_end']]
        start = len(output); output.extend(crop)
        segments.append({'unit_id': key, 'start': start, 'end': len(output), 'sha256': digest(crop)})
        spans.append({'text': part['text'], 'start': (start+timing['onset']-timing['crop_start'])/RATE,
                      'end': (start+timing['offset']-timing['crop_start'])/RATE})
    final = measurements[parts[-1]['unit_id']]
    return {'pcm': output, 'segments': segments, 'silences': silences, 'words': spans,
            'last_word_start': spans[-1]['start'], 'acoustic_end': spans[-1]['end'],
            'crop_end_bound': len(output)/RATE, 'uncertainty_s': final['uncertainty_s'],
            'threshold_spread_s': final['offset_threshold_spread_s'], 'frame_resolution_s': FRAME/RATE}


def verify_arithmetic(samples, segments, silences, joins=()):
    """Check hashes, zero spans and exact partition arithmetic, not ground truth."""
    intervals = []
    for segment in segments:
        start, end = segment['start'], segment['end']
        if not 0 <= start < end <= len(samples) or digest(samples[start:end]) != segment['sha256']:
            raise ValueError('Segment hash or bounds mismatch')
        intervals.append((start, end))
    for silence in silences:
        start, end = silence['start'], silence['end']
        if not 0 <= start <= end <= len(samples) or any(samples[start:end]):
            raise ValueError('Non-zero sample or invalid silence span')
        if start < end:
            intervals.append((start, end))
    cursor = 0
    for start, end in sorted(intervals):
        if start != cursor:
            raise ValueError('Overlap or unaccounted sample in join arithmetic')
        cursor = end
    if cursor != len(samples):
        raise ValueError('Unaccounted tail samples')
    for join in joins:
        if join['end']-join['start'] != join['expected_samples'] or any(samples[join['start']:join['end']]):
            raise ValueError('Exact join count mismatch')
    return {'arithmetic_consistency': 'PASS', 'independent_acoustic_ground_truth': False,
            'status': 'UNFROZEN'}


def assert_window_energy_gap(samples, left=170, right=245):
    """Reject half-second quiet runs as a same-method consistency check."""
    start, end = round(left*RATE), round(right*RATE)
    values = [math.sqrt(sum(v*v for v in samples[i:i+FRAME])/len(samples[i:i+FRAME]))
              for i in range(start, end, FRAME)]
    threshold = max(128, max(values, default=0)*0.03)
    run = longest = 0
    for value in values:
        run = run+1 if value < threshold else 0
        longest = max(longest, run)
    if longest*FRAME/RATE >= 0.5:
        raise ValueError('Failure-window near-silence reaches 0.5 seconds')
    return longest*FRAME/RATE
