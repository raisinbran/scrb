"""D4: independent calibration of the bounded long-correlation anchor method. No thresholds or parameters are changed.

Part 1, simulation with planted truth. The track's frozen source WAV (24 kHz) is placed on a synthetic recording timeline
with a KNOWN fixed offset, a KNOWN linear drift and KNOWN planted steps (inserted silence = positive step, dropped audio =
negative step, i.e. gaps in the sample-continuous view), resampled to 48 kHz, scaled to the practice level, given noise at the
practice level, then cut into 5 s chunks that are Opus-encoded (libopus, VOIP, 32 kb/s, constrained VBR, complexity 10, 20 ms
frames, the settings of native/windows-capture ChunkStore.cpp) and decoded with the same ffmpeg the scorer uses. The real
match_long_correlation then runs on every long unit, exactly as the scorer calls it (search offset = detected lead marker - 1).

Part 2, real data. The practice recording's lead and trail marker tones are detected independently of correlation; the
correlation anchors nearest each marker are compared with the marker-derived offsets.

Not simulated: route-dependent bias (VB-CABLE, loopback enhancements, device processing), the room, non-flat gain, the
real capture dropouts' exact shape. See the proposal that accompanies the results.
"""
import argparse
import array
import bisect
import concurrent.futures as futures
import hashlib
import json
import math
import random
import statistics
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import long_correlation as lc  # noqa: E402
from marker_clock import detect_marker  # noqa: E402
from v3a_timing import pcm16  # noqa: E402

SOURCE_RATE, RECORDING_RATE, CHUNK_S = 24000, 48000, 5
FREQUENCY = {'microphone': 880, 'meeting': 1320}
PRACTICE = {   # measured in the practice recording (results 2026-11-09, marker audit)
    'microphone': {'offset_s': 4.695-1.0, 'declared_rate': 23987, 'gain_db': -0.4},
    'meeting': {'offset_s': 4.655-1.0, 'declared_rate': 23987, 'gain_db': 2.1}}
NOISE_RMS_LSB = 0.6          # measured in digitally quiet stretches of both practice tracks (-95 dBFS)
ENCODE = ['-c:a', 'libopus', '-application', 'voip', '-b:a', '32k', '-vbr', 'constrained', '-compression_level', '10',
          '-frame_duration', '20', '-ar', '48000', '-ac', '1']


def write_wav(path, samples, rate):
    with wave.open(str(path), 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(samples.tobytes() if sys.byteorder == 'little' else bytes(array.array('h', samples)))


def plant(seed, count_steps=5, count_gaps=3, low_s=30, high_s=370):
    """Known steps in source time: [(source_sample, signed_shift_samples)], sorted. Magnitudes 51-104 ms, both signs;
    gaps are dropped capture audio of 160-210 ms (negative)."""
    rng = random.Random(seed)
    steps = []
    for _ in range(count_steps):
        steps.append((round(rng.uniform(low_s, high_s)*SOURCE_RATE),
                      round(rng.choice((-1, 1))*rng.uniform(.051, .104)*SOURCE_RATE)))
    for _ in range(count_gaps):
        steps.append((round(rng.uniform(low_s, high_s)*SOURCE_RATE), -round(rng.uniform(.160, .210)*SOURCE_RATE)))
    steps.sort()
    return steps


def build_timeline(source, steps, offset_samples):
    """Source samples with inserted silence / dropped audio at the planted steps, after a leading silence."""
    timeline = array.array('h', [0])*offset_samples
    cursor = 0
    for position, shift in steps:
        timeline.extend(source[cursor:position])
        cursor = position
        if shift > 0:
            timeline.extend(array.array('h', [0])*shift)
        else:
            cursor += -shift
    timeline.extend(source[cursor:])
    return timeline


class Truth:
    """Planted recording time of any source time."""
    def __init__(self, steps, offset_samples, declared_rate):
        self.steps, self.offset, self.rate = steps, offset_samples, declared_rate
        self.positions = [p for p, _ in steps]
        self.cumulative = [0]
        for _, shift in steps:
            self.cumulative.append(self.cumulative[-1]+shift)

    def recording_s(self, source_s):
        sample = source_s*SOURCE_RATE
        index = bisect.bisect_right(self.positions, sample)
        return (self.offset+sample+self.cumulative[index])/self.rate

    def offset_s(self, source_s):
        return self.recording_s(source_s)-source_s

    def steps_inside(self, low_s, high_s):
        return [s for s in self.steps if low_s*SOURCE_RATE <= s[0] <= high_s*SOURCE_RATE]


def run_ffmpeg(decoder, args):
    subprocess.run([str(decoder), '-nostdin', '-v', 'error', '-y', *args], check=True, capture_output=True)


def render_recording(source, steps, track, decoder, work, seed, noise_rms=NOISE_RMS_LSB):
    """Return (continuous 48 kHz int16 samples of the decoded chunks, Truth)."""
    settings = PRACTICE[track]
    offset_samples = round(settings['offset_s']*settings['declared_rate'])
    timeline = build_timeline(source, steps, offset_samples)
    wide, narrow = Path(work)/'timeline.wav', Path(work)/'resampled.wav'
    write_wav(wide, timeline, settings['declared_rate'])   # declared slightly below 24 kHz: this is the planted linear drift
    run_ffmpeg(decoder, ['-i', str(wide), '-af', 'aresample=48000', '-ac', '1', '-c:a', 'pcm_s16le', str(narrow)])
    samples, rate = pcm16(narrow)
    rng = random.Random(seed)
    gain = 10**(settings['gain_db']/20)
    shaped = array.array('h', (max(-32768, min(32767, round(v*gain+rng.gauss(0, noise_rms)))) for v in samples))
    chunk = CHUNK_S*RECORDING_RATE
    pieces = [shaped[i:i+chunk] for i in range(0, len(shaped), chunk)]

    def through_opus(index):
        wav, opus = Path(work)/('c%03d.wav' % index), Path(work)/('c%03d.opus' % index)
        write_wav(wav, pieces[index], RECORDING_RATE)
        run_ffmpeg(decoder, ['-i', str(wav), *ENCODE, str(opus)])
        decoded = subprocess.run([str(decoder), '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', str(opus),
                                  '-map', '0:a:0', '-f', 'wav', '-acodec', 'pcm_s16le', '-'], capture_output=True, check=True).stdout
        import io
        with wave.open(io.BytesIO(decoded), 'rb') as stream:
            block = array.array('h', stream.readframes(stream.getnframes()))
        return block
    with futures.ThreadPoolExecutor(8) as pool:
        blocks = list(pool.map(through_opus, range(len(pieces))))
    continuous = array.array('h')
    for block in blocks:
        continuous.extend(block)
    return continuous, Truth(steps, offset_samples, settings['declared_rate'])


_state = {}


def _init(recording_path, source_path):
    _state['recording'], _state['rate'] = pcm16(recording_path)
    _state['source'], _state['source_rate'] = pcm16(source_path)


def _match(task):
    unit, expected = task
    try:
        return lc.match_long_correlation(_state['recording'], _state['rate'], _state['source'], _state['source_rate'], unit, expected)
    except (ValueError, KeyError) as error:
        return {'id': unit['id'], 'error': str(error)}


def match_all(recording_path, source_path, units, expected_of, workers):
    tasks = [(u, expected_of(u)) for u in units]
    with futures.ProcessPoolExecutor(workers, initializer=_init, initargs=(str(recording_path), str(source_path))) as pool:
        return list(pool.map(_match, tasks))


def summarize(values):
    values = sorted(values)
    if not values:
        return None
    return {'n': len(values), 'median': statistics.median(values), 'p95': values[min(len(values)-1, math.ceil(.95*len(values))-1)],
            'max': values[-1]}


def simulate(track, seed, source_path, annotations, decoder, workers, work, noise_rms=NOISE_RMS_LSB):
    source, rate = pcm16(source_path)
    units = [u for u in lc.annotation_units(annotations, rate) if not u['short']]
    steps = plant(seed)
    continuous, truth = render_recording(source, steps, track, decoder, work, seed, noise_rms)
    recording_path = Path(work)/'continuous.wav'
    write_wav(recording_path, continuous, RECORDING_RATE)
    lead = detect_marker(continuous, RECORDING_RATE, FREQUENCY[track], (0, 10))
    search_offset = lead['position']-1
    expected_of = lambda u: u['source_start_sample']/rate+.1+search_offset
    results = match_all(recording_path, source_path, units, expected_of, workers)
    rows = []
    for unit, result in zip(units, results):
        start = unit['source_start_sample']/rate+.1
        row = {'track': track, 'seed': seed, 'id': unit['id'], 'source_start_s': start}
        if 'error' in result:
            rows.append({**row, 'matcher_error': result['error']})
            continue
        true = truth.offset_s(start)
        inside = truth.steps_inside(start, start+3.02)
        nearest = min((abs(p/SOURCE_RATE-start) for p, _ in steps), default=None)
        rows.append({**row, 'estimated_offset_s': result['offset_s'], 'planted_offset_s': true, 'error_s': result['offset_s']-true,
                     'reported_uncertainty_s': result['uncertainty_s'], 'validated': result['validated'],
                     'peak_spread_s': result['method_peak_spread_s'], 'step_inside_template': bool(inside),
                     'distance_to_nearest_step_s': nearest})
    return rows, {'track': track, 'seed': seed, 'planted_steps': [[p/SOURCE_RATE, s/SOURCE_RATE] for p, s in steps],
                  'lead_marker_detected_s': lead['position'], 'declared_rate_hz': PRACTICE[track]['declared_rate'],
                  'drift_ppm': (SOURCE_RATE/PRACTICE[track]['declared_rate']-1)*1e6, 'fixed_offset_s': PRACTICE[track]['offset_s'],
                  'noise_rms_lsb': noise_rms, 'unvalidated_anchors': sum(1 for r in rows if not r.get('validated', False)), 'gain_db': PRACTICE[track]['gain_db']}


def report(rows):
    ok = [r for r in rows if 'error_s' in r]
    clean = [r for r in ok if not r['step_inside_template']]
    absolute = lambda items: [abs(r['error_s']) for r in items]
    out = {'units': len(rows), 'matcher_errors': len(rows)-len(ok), 'validated': sum(r['validated'] for r in ok),
           'not_validated': sum(not r['validated'] for r in ok),
           'abs_error_all_s': summarize(absolute(ok)), 'abs_error_validated_s': summarize(absolute([r for r in ok if r['validated']])),
           'abs_error_validated_no_step_in_template_s': summarize(absolute([r for r in clean if r['validated']])),
           'abs_error_validated_step_in_template_s': summarize(absolute([r for r in ok if r['validated'] and r['step_inside_template']])),
           'signed_error_validated_median_s': statistics.median([r['error_s'] for r in ok if r['validated']] or [0]),
           'reported_uncertainty_s': summarize([r['reported_uncertainty_s'] for r in ok]),
           'validated_with_error_above_reported_uncertainty': sum(r['validated'] and abs(r['error_s']) > r['reported_uncertainty_s'] for r in ok),
           'by_position_s': {}, 'by_track': {}}
    for low in range(0, 420, 60):
        group = [r for r in ok if r['validated'] and low <= r['source_start_s'] < low+60]
        out['by_position_s']['%d-%d' % (low, low+60)] = summarize(absolute(group))
    for track in sorted({r['track'] for r in rows}):
        group = [r for r in ok if r['validated'] and r['track'] == track]
        out['by_track'][track] = summarize(absolute(group))
    return out


def real_data(track, source_path, annotations, recording_path, workers, nearest=2):
    """Compare marker-derived offsets with the correlation anchors nearest each marker (practice recording, continuous view)."""
    samples, rate = pcm16(recording_path)
    source, source_rate = pcm16(source_path)
    lead = detect_marker(samples, rate, FREQUENCY[track], (0, 10))
    trail = detect_marker(samples, rate, FREQUENCY[track], (380, 390))
    source_lead = detect_marker(source, source_rate, FREQUENCY[track], (0, 10))
    source_trail = detect_marker(source, source_rate, FREQUENCY[track], (380, 390))
    marker_offsets = {'lead': lead['position']-source_lead['position'], 'trail': trail['position']-source_trail['position']}
    units = [u for u in lc.annotation_units(annotations, source_rate) if not u['short']]
    search_offset = lead['position']-1
    results = match_all(recording_path, source_path, units, lambda u: u['source_start_sample']/source_rate+.1+search_offset, workers)
    anchors = [r for r in results if 'error' not in r]
    out = {'track': track, 'marker_offsets_s': marker_offsets, 'marker_uncertainty_s': [lead['uncertainty_s']+source_lead['uncertainty_s'],
           trail['uncertainty_s']+source_trail['uncertainty_s']], 'long_units': len(units), 'matcher_errors': len(results)-len(anchors),
           'validated_anchors': sum(a['validated'] for a in anchors), 'anchors': []}
    for name, group in (('lead', anchors[:nearest]), ('trail', anchors[-nearest:])):
        for a in group:
            out['anchors'].append({'near': name, 'id': a['id'], 'source_start_s': a['source_start_s'], 'offset_s': a['offset_s'],
                                   'validated': a['validated'], 'reported_uncertainty_s': a['uncertainty_s'],
                                   'difference_to_marker_offset_s': a['offset_s']-marker_offsets[name],
                                   'distance_to_marker_s': abs(a['source_start_s']-(source_lead if name == 'lead' else source_trail)['position'])})
    out['all_anchor_offsets_s'] = [[a['id'], a['source_start_s'], a['offset_s'], a['validated']] for a in anchors]
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assembly', type=Path, required=True, help='folder with microphone.wav, meeting.wav and their annotations')
    parser.add_argument('--decoder', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--seeds', type=int, nargs='+', default=[1, 2, 3])
    parser.add_argument('--workers', type=int, default=8)
    parser.add_argument('--noise-db-above-measured', type=float, default=0.0, help='sensitivity only; 0 is the measured practice level')
    parser.add_argument('--real-recording', type=Path, nargs=2, metavar=('MIC_CONTINUOUS', 'MEETING_CONTINUOUS'))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    provenance = {'decoder_sha256': hashlib.sha256(args.decoder.read_bytes()).hexdigest(),
                  'decoder_version': subprocess.run([str(args.decoder), '-version'], capture_output=True, text=True).stdout.splitlines()[0],
                  'encode_flags': ENCODE, 'noise_db_above_measured': args.noise_db_above_measured, 'matcher_settings': lc.SETTINGS, 'seeds': args.seeds,
                  'encoder_source': 'native/windows-capture/src/ChunkStore.cpp: OPUS_APPLICATION_VOIP, 32000 b/s, VBR, constrained, complexity 10, 960-sample frames'}
    rows, scenarios = [], []
    for track in ('microphone', 'meeting'):
        source_path = args.assembly/(track+'.wav')
        annotations = json.loads((args.assembly/(track+'-annotations.json')).read_text(encoding='utf-8-sig'))
        provenance['source_sha256_'+track] = hashlib.sha256(source_path.read_bytes()).hexdigest()
        for seed in args.seeds:
            with tempfile.TemporaryDirectory() as work:
                got, scenario = simulate(track, seed, source_path, annotations, args.decoder, args.workers, work, NOISE_RMS_LSB*10**(args.noise_db_above_measured/20))
            rows.extend(got)
            scenarios.append(scenario)
            print(track, seed, report(got)['abs_error_validated_s'], flush=True)
    result = {'provenance': provenance, 'scenarios': scenarios, 'simulation': report(rows), 'rows': rows}
    if args.real_recording:
        result['real_data'] = {}
        for track, path in zip(('microphone', 'meeting'), args.real_recording):
            result['real_data'][track] = real_data(track, args.assembly/(track+'.wav'),
                json.loads((args.assembly/(track+'-annotations.json')).read_text(encoding='utf-8-sig')), path, args.workers)
    (args.out/'calibration.json').write_text(json.dumps(result, indent=1), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('rows', 'scenarios')}, indent=1)[:6000])


if __name__ == '__main__':
    main()
