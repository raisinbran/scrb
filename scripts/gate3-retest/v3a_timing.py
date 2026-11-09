"""Offline Protocol v3a evidence views, finite timing intervals and long anchors.

No resampling, affine fitting, sample deletion or capture changes occur here.
Exact PCM matching is deliberately strict: noisy/ambiguous matches are unsupported,
not calibrated by an invented correlation cutoff.
"""
import array
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import wave


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def pcm16(path):
    with wave.open(str(path), 'rb') as stream:
        require(stream.getsampwidth() == 2 and stream.getnchannels() == 1
                and stream.getcomptype() == 'NONE', 'Expected mono PCM16')
        rate = stream.getframerate()
        samples = array.array('h', stream.readframes(stream.getnframes()))
    if sys.byteorder != 'little':
        samples.byteswap()
    return samples, rate


def opus_tags(raw):
    """Read laced Ogg packets, rejecting duplicate tags rather than overwriting."""
    cursor = 0
    packet = bytearray()
    found = None
    while cursor < len(raw):
        require(raw[cursor:cursor+4] == b'OggS', 'Invalid Ogg page')
        require(cursor+27 <= len(raw), 'Truncated Ogg header')
        count = raw[cursor+26]
        sizes = raw[cursor+27:cursor+27+count]
        require(len(sizes) == count, 'Truncated Ogg lacing')
        cursor += 27+count
        for size in sizes:
            require(cursor+size <= len(raw), 'Truncated Ogg packet')
            packet.extend(raw[cursor:cursor+size])
            cursor += size
            if size < 255:
                if packet.startswith(b'OpusTags'):
                    require(found is None, 'Duplicated OpusTags record')
                    data = bytes(packet)
                    offset = 8
                    def number():
                        nonlocal offset
                        require(offset+4 <= len(data), 'Truncated OpusTags number')
                        result = struct.unpack_from('<I', data, offset)[0]
                        offset += 4
                        return result
                    def field():
                        nonlocal offset
                        length = number()
                        require(offset+length <= len(data), 'Truncated OpusTags field')
                        result = data[offset:offset+length]
                        offset += length
                        return result
                    field()
                    found = {}
                    for _ in range(number()):
                        key, sep, value = field().decode('utf-8').partition('=')
                        require(sep and key not in found, 'Missing or duplicated timestamp/tag record')
                        found[key] = value
                packet.clear()
    require(not packet and found is not None, 'Missing or incomplete OpusTags')
    return found


def gap_map(records, track, rate, metadata_sha256):
    """Validate a complete ordered inventory, retaining each source identity.

    start_ns is embedded START_NS; metadata_start_ns/end_ns are the independent
    chunk index. Counts are decoded frames at the native rate, never declared
    duration substituted for decoded frames.
    """
    require(track in ('microphone', 'meeting') and isinstance(rate, int) and rate > 0,
            'Invalid track/rate')
    require(bool(records), 'Missing chunk records')
    continuous = 0
    previous_end = 0
    seen = set()
    rows = []
    for seq, record in enumerate(records):
        source = record['source_sha256']
        require(isinstance(source, str) and len(source) == 64
                and all(c in '0123456789abcdef' for c in source), 'Missing source identity')
        require(source not in seen and record['seq'] == seq, 'Missing or duplicated chunk record')
        seen.add(source)
        for key in ('start_ns', 'metadata_start_ns', 'metadata_end_ns', 'decoded_samples'):
            require(type(record[key]) is int and record[key] >= 0, 'Invalid timestamp/sample-count record')
        require(record['start_ns'] == record['metadata_start_ns'], 'Inconsistent embedded timestamp')
        start = round(record['start_ns']*rate/1e9)
        end = round(record['metadata_end_ns']*rate/1e9)
        count = record['decoded_samples']
        require(count > 0 and end-start == count, 'Inconsistent timestamp/sample-count record')
        require(start >= previous_end, 'Overlapping timestamp/sample-count record')
        gap = start-previous_end
        rows.append({**record, 'continuous_start_sample': continuous,
                     'continuous_end_sample': continuous+count,
                     'timestamped_start_sample': start, 'timestamped_end_sample': end,
                     'gap_before_samples': gap, 'cumulative_gap_samples': start-continuous})
        continuous += count
        previous_end = end
    return {'valid': True, 'track': track, 'rate': rate, 'metadata_sha256': metadata_sha256,
            'chunks': rows, 'decoded_samples': continuous, 'timestamped_samples': previous_end,
            'definition': 'Gaps have no assigned samples; timestamped zero placeholders are not physical silence.'}


def load_views(metadata_path, decoder, track):
    """Decode original Opus chunks once, without resampling or writing audio."""
    metadata_path = Path(metadata_path)
    metadata_bytes = metadata_path.read_bytes()
    metadata_sha = hashlib.sha256(metadata_bytes).hexdigest()
    meta = json.loads(metadata_bytes.decode('utf-8-sig'))
    records, blocks = [], []
    rate = None
    inventory = meta['chunks']
    require(inventory and len({row['file'] for row in inventory}) == len(inventory),
            'Missing or duplicated chunk file record')
    actual = {p.name for p in metadata_path.parent.glob('*.opus')}
    require(actual == {row['file'] for row in inventory}, 'Missing/unindexed chunk record')
    for row in inventory:
        path = (metadata_path.parent/row['file']).resolve()
        require(path.parent == metadata_path.parent.resolve(), 'Chunk path escaped track directory')
        raw = path.read_bytes()
        tags = opus_tags(raw)
        chunk_rate = int(tags['RATE'])
        if rate is None:
            rate = chunk_rate
        require(chunk_rate == rate and int(tags['SEQUENCE']) == row['seq'], 'Inconsistent chunk rate/sequence')
        decoded = subprocess.run([str(decoder), '-nostdin', '-v', 'error', '-protocol_whitelist',
                                  'file,pipe', '-i', str(path), '-map', '0:a:0', '-f', 'wav',
                                  '-acodec', 'pcm_s16le', '-'], capture_output=True, check=True).stdout
        # A pipe WAV can declare an unknown frame count; wave reads the actual bytes.
        import io
        with wave.open(io.BytesIO(decoded), 'rb') as stream:
            require(stream.getnchannels() == 1 and stream.getframerate() == rate
                    and stream.getsampwidth() == 2, 'Decoder changed native format')
            block = array.array('h', stream.readframes(stream.getnframes()))
        if sys.byteorder != 'little':
            block.byteswap()
        require(hashlib.sha256(path.read_bytes()).hexdigest() == hashlib.sha256(raw).hexdigest(),
                'Source changed during decode')
        blocks.append(block)
        records.append({'seq': row['seq'], 'source_file': row['file'],
                        'source_sha256': hashlib.sha256(raw).hexdigest(),
                        'start_ns': int(tags['START_NS']), 'metadata_start_ns': row['startNs'],
                        'metadata_end_ns': row['endNs'], 'decoded_samples': len(block)})
    require(digest(metadata_path) == metadata_sha, 'Chunk inventory changed during decode')
    try:
        mapping = gap_map(records, track, rate, metadata_sha)
        require(round(meta['endNs']*rate/1e9) == mapping['timestamped_samples'], 'Inconsistent final timestamp')
    except (ValueError, KeyError, TypeError) as error:
        # Preserve the original audit adapter only as separately labelled legacy
        # evidence. Its declared-end clipping never enters a v3a timing interval.
        total = round(meta['endNs']*rate/1e9)
        require(total >= 0, 'Invalid legacy recording extent')
        legacy = array.array('h', [0])*total
        continuous = array.array('h')
        for record, block in zip(records, blocks):
            continuous.extend(block)
            start = round(record['metadata_start_ns']*rate/1e9)
            end = min(start+len(block), round(record['metadata_end_ns']*rate/1e9), total)
            require(0 <= start <= end <= total, 'Invalid legacy timestamp placement')
            legacy[start:end] = block[:end-start]
        return continuous, legacy, {'valid': False, 'track': track, 'rate': rate,
             'metadata_sha256': metadata_sha, 'chunks': records, 'error': str(error),
             'original_view_basis': 'original-v3 legacy adapter: timestamp placement and declared-end clipping',
             'timestamped_capture_view': 'INCONCLUSIVE: no validated all-sample placement'}
    continuous = array.array('h')
    timestamped = array.array('h', [0])*mapping['timestamped_samples']
    for record, block in zip(mapping['chunks'], blocks):
        continuous.extend(block)
        a, b = record['timestamped_start_sample'], record['timestamped_end_sample']
        timestamped[a:b] = block
    return continuous, timestamped, mapping


def placement_interval(seconds, mapping):
    require(finite(seconds) and 0 <= seconds <= mapping['decoded_samples']/mapping['rate'],
            'Unsupported continuous placement')
    sample = seconds*mapping['rate']
    # At a boundary, the following sample belongs after the gap.
    row = next((r for r in mapping['chunks'] if sample < r['continuous_end_sample']), mapping['chunks'][-1])
    return [seconds, seconds+row['cumulative_gap_samples']/mapping['rate']]


def match_long(recording, source, rate, anchor):
    """Validate a unique, nonflat, >=1 s long-utterance exact PCM match.

    This narrow validated matcher rejects route/noise differences. Feasibility
    correlation peaks have no approved calibration and cannot enter scoring.
    """
    require(anchor.get('short') is False, 'Short-word matching is forbidden')
    keys = ('source_start_sample', 'source_end_sample', 'search_start_sample', 'search_end_sample')
    require(all(type(anchor[k]) is int for k in keys), 'Invalid long-anchor sample bounds')
    a, b, left, right = (anchor[k] for k in keys)
    require(0 <= a < b <= len(source) and b-a >= rate, 'Unsupported long utterance')
    require(0 <= left < right <= len(recording), 'Unbounded long-anchor search')
    template = source[a:b]
    require(len(set(template)) > 1, 'Flat long anchor')
    # Byte search is exhaustive; only sample-aligned occurrences count.
    haystack = recording[left:right].tobytes()
    needle = template.tobytes()
    positions = []
    cursor = 0
    while True:
        found = haystack.find(needle, cursor)
        if found < 0:
            break
        if found % recording.itemsize == 0:
            positions.append(left+found//recording.itemsize)
        cursor = found+1
    require(len(positions) == 1, 'Long anchor missing or ambiguous; timing INCONCLUSIVE')
    start = positions[0]/rate
    return {'id': anchor['id'], 'source_start_s': a/rate, 'source_end_s': b/rate,
            'recording_start_s': start, 'recording_end_s': start+(b-a)/rate,
            'offset_s': start-a/rate, 'uncertainty_s': 1/rate,
            'method': 'unique-exact-long-PCM', 'validated': True}


def load_long_anchors(recording, source, rate, searches, annotations_path, source_sha256):
    """Match the complete frozen long inventory, preventing selective bracketing."""
    annotations = json.loads(Path(annotations_path).read_text(encoding='utf-8-sig'))
    require(annotations.get('frozen') is True and annotations.get('sample_rate') == rate
            and annotations.get('source_sha256') == source_sha256, 'Unbound source annotations')
    utterances = annotations['utterances']
    require(utterances and len({u['id'] for u in utterances}) == len(utterances),
            'Missing or duplicated source utterance')
    previous_end = 0
    for unit in utterances:
        require(type(unit['short']) is bool and type(unit.get('eligible')) is bool
                and type(unit['source_start_sample']) is int
                and type(unit['source_end_sample']) is int
                and previous_end <= unit['source_start_sample'] < unit['source_end_sample'] <= len(source),
                'Invalid/overlapping source utterance inventory')
        previous_end = unit['source_end_sample']
    longs = [u for u in utterances if not u['short']]
    require(len(searches) == len(longs) and [a['id'] for a in searches] == [u['id'] for u in longs],
            'Missing, duplicated or reordered long anchors; immediate brackets unavailable')
    result = []
    for unit, search in zip(longs, searches):
        result.append(match_long(recording, source, rate,
            {**unit, 'search_start_sample': search['search_start_sample'],
             'search_end_sample': search['search_end_sample']}))
    return {'anchors': result, 'utterances': utterances, 'annotations_sha256': digest(annotations_path)}


def step_bounds(anchors, units):
    """Bound changes between adjacent long anchors; never correct their offsets.

    A change may lie anywhere between supports. Widen all potentially affected
    units, including crossing units, through the right bracketing anchor. Each
    adjacent pair bounds its own region; missing coverage fails closed.
    """
    require(len(anchors) >= 2, 'Missing bracketing long anchors')
    require(len({a['id'] for a in anchors}) == len(anchors), 'Duplicated long anchor')
    for anchor in anchors:
        require(anchor.get('validated') is True and anchor.get('method') == 'unique-exact-long-PCM',
                'Unvalidated long anchor')
        require(all(finite(anchor[k]) for k in ('source_start_s', 'source_end_s', 'recording_start_s',
                                               'recording_end_s', 'offset_s', 'uncertainty_s'))
                and anchor['uncertainty_s'] >= 0, 'Unsupported anchor uncertainty')
    steps = []
    for before, after in zip(anchors, anchors[1:]):
        require(before['recording_end_s'] <= after['recording_start_s']
                and before['source_end_s'] <= after['source_start_s'], 'Overlapping/unordered long anchors')
        change = after['offset_s']-before['offset_s']
        combined = before['uncertainty_s']+after['uncertainty_s']
        if abs(change) > combined:
            steps.append({'location_interval_s': [before['recording_end_s']-before['uncertainty_s'],
                                                 after['recording_start_s']+after['uncertainty_s']],
                          'until_s': after['recording_end_s']+after['uncertainty_s'], 'signed_change_s': change,
                          'symmetric_uncertainty_s': abs(change)+combined,
                          'anchors': [before['id'], after['id']]})
    for unit in units:
        require(anchors[0]['recording_start_s'] <= unit['continuous_start_s']
                and unit['continuous_last_word_end_s'] <= anchors[-1]['recording_end_s'],
                'Unit has no bracketing long-anchor coverage')
    return steps


def prepare_units(units, mapping, anchors):
    """Keep the denominator and widen both speech endpoints and last-word start."""
    steps = step_bounds(anchors, units)
    result = []
    for unit in units:
        a, b, c = (unit[k] for k in ('continuous_start_s', 'continuous_last_word_start_s',
                                    'continuous_last_word_end_s'))
        require(all(finite(t) for t in (a, b, c)) and a <= b <= c, 'Unsupported speech placement')
        end = placement_interval(c, mapping)
        start = placement_interval(b, mapping)
        widening = sum(step['symmetric_uncertainty_s'] for step in steps
                       if c >= step['location_interval_s'][0] and a <= step['until_s'])
        result.append({**unit, 'eligible': unit['eligible'], 'start': a, 'last_word_start': b,
                       'last_word_end': c, 'earliest_acoustic_end_s': end[0]-widening,
                       'latest_acoustic_end_s': end[1]+widening,
                       'last_word_start_interval_s': [start[0]-widening, start[1]+widening],
                       'step_uncertainty_s': widening})
    return result, steps
