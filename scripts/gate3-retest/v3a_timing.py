"""Offline Protocol v3a evidence views, finite timing intervals and long anchors.

No resampling, affine fitting, sample deletion or capture changes occur here.
The bounded long-correlation path reuses the interior audit criteria unchanged.
Ambiguous anchors are unsupported; exact PCM matching remains explicitly available.
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


def capture_clock_fields(records, track, metadata_sha256):
    """Carry preserved clock evidence; do not integrate observer publications."""
    sessions = {r.get('session_id') for r in records if r.get('session_id') is not None}
    complete = all(r.get('device_stamp_ns') is not None and r.get('session_id') is not None for r in records)
    origins = {r['device_stamp_ns']-r['start_ns'] for r in records if r.get('device_stamp_ns') is not None}
    origin = next(iter(origins)) if complete and len(origins) == 1 and len(sessions) == 1 else None
    session = next(iter(sessions)) if len(sessions) == 1 else None
    identity = {'track': track, 'session_id': session, 'chunks_metadata_sha256': metadata_sha256,
                'ordered_source_sha256': [r['source_sha256'] for r in records]}
    identity['sha256'] = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'schema_version': 1, 'session_id': session, 'session_origin_ns': origin,
            'origin_status': 'RECONSTRUCTED_CONSTANT' if origin is not None else 'UNAVAILABLE_OR_INCONSISTENT',
            'origin_method': 'SCRB_DEVICE_STAMP_NS minus embedded START_NS; constant across every chunk; not a retained start ACK',
            'origin_evidence_chunks': len(records) if origin is not None else 0,
            'qpc_basis': {'capture_clock': 'QueryPerformanceCounter-derived monotonic nanoseconds',
                          'capture_units': 'ns', 'nanoseconds_per_second': 1000000000,
                          'raw_qpc_frequency_hz': None, 'observer_clock': 'Stopwatch.GetTimestamp',
                          'observer_frequency_hz': None, 'observer_integration': 'NOT_IMPLEMENTED'},
            'track_identity': identity, 'observer_to_scorer_integration': 'NOT_IMPLEMENTED'}


def audited_overrun(record, track, rate, metadata_sha256, declared):
    policy = json.loads(Path(__file__).with_name('audited_decode_spans.json').read_text(encoding='utf-8-sig'))
    for row in policy['overruns']:
        if (row['track'] == track and row['rate'] == rate and row['metadata_sha256'] == metadata_sha256
                and row['source_sha256'] == record['source_sha256'] and row['seq'] == record['seq']
                and row['declared_samples'] == declared and row['decoded_samples'] == record['decoded_samples']):
            return row['overrun_samples']
    return 0


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
    previous_start = -1
    cumulative_gaps = 0
    cumulative_overruns = 0
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
        overrun = audited_overrun(record, track, rate, metadata_sha256, end-start)
        require(count > 0 and end > start and count-(end-start) == overrun,
                'Inconsistent timestamp/sample-count record outside audited span allowance')
        require(start > previous_start, 'Reordered or duplicated embedded timestamps')
        gap = max(0, start-previous_end)
        overlap = max(0, previous_end-start)
        cumulative_gaps += gap
        cumulative_overruns += overrun
        rows.append({**record, 'continuous_start_sample': continuous,
                     'continuous_end_sample': continuous+count,
                     'timestamped_start_sample': start, 'timestamped_end_sample': end,
                     'gap_before_samples': gap, 'overlap_before_samples': overlap,
                     'decoded_overrun_samples': overrun, 'cumulative_overrun_samples': cumulative_overruns,
                     'timestamp_displacement_samples': start-continuous,
                     'cumulative_gap_samples': cumulative_gaps})
        continuous += count
        previous_end = max(previous_end, end)
        previous_start = start
    return {'schema_version': 2, 'valid': True, 'track': track, 'rate': rate, 'metadata_sha256': metadata_sha256,
            'chunks': rows, 'decoded_samples': continuous, 'timestamped_samples': previous_end,
            'clock_context': capture_clock_fields(records, track, metadata_sha256),
            'audited_overrun_samples': cumulative_overruns,
            'timestamped_view_policy': 'original audit declared windows; overrun clipped and overlaps last-chunk-wins only in legacy view',
            'definition': 'Gaps are union intervals with no assigned samples; overlaps remain explicit and never subtract gaps. Continuous samples are never trimmed.'}


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
        require(tags.get('TRACK', track) == track, 'Embedded track identity mismatch')
        require(not records or tags.get('SESSION') == records[0].get('session_id'), 'Embedded session identity mismatch')
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
                        'metadata_end_ns': row['endNs'], 'decoded_samples': len(block),
                        'session_id': tags.get('SESSION'), 'embedded_track': tags.get('TRACK'),
                        'device_stamp_ns': int(tags['SCRB_DEVICE_STAMP_NS']) if 'SCRB_DEVICE_STAMP_NS' in tags else None,
                        'wall_utc': tags.get('SCRB_WALL_UTC')})
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
             'timestamped_capture_view': 'INCONCLUSIVE: no validated all-sample placement',
             'clock_context': capture_clock_fields(records, track, metadata_sha)}
    continuous = array.array('h')
    timestamped = array.array('h', [0])*mapping['timestamped_samples']
    for record, block in zip(mapping['chunks'], blocks):
        continuous.extend(block)
        a, b = record['timestamped_start_sample'], record['timestamped_end_sample']
        timestamped[a:b] = block[:b-a]
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


def load_long_anchors(recording, source, rate, searches, annotations_path, source_sha256,
                      *, method='exact', recording_rate=None, search_offset_s=None):
    """Match the complete frozen long inventory, preventing selective bracketing."""
    annotation_bytes = Path(annotations_path).read_bytes()
    annotation_sha = hashlib.sha256(annotation_bytes).hexdigest()
    annotations = json.loads(annotation_bytes.decode('utf-8-sig'))
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
    recording_rate = rate if recording_rate is None else recording_rate
    require(method in ('exact', 'bounded-correlation'), 'Unknown long matcher')
    for unit, search in zip(longs, searches):
        if method == 'bounded-correlation':
            from long_correlation import match_long_correlation
            expected = search.get('expected_recording_s')
            if expected is None:
                require(finite(search_offset_s), 'Missing constant long-anchor search offset')
                expected = unit['source_start_sample']/rate+.1+search_offset_s
            result.append(match_long_correlation(recording, recording_rate, source, rate, unit, expected))
        else:
            require(recording_rate == rate, 'Exact PCM matching requires equal native rates')
            result.append(match_long(recording, source, rate,
                {**unit, 'search_start_sample': search['search_start_sample'],
                 'search_end_sample': search['search_end_sample']}))
    require(digest(annotations_path) == annotation_sha, 'Source annotations changed during matching')
    return {'anchors': result, 'utterances': utterances, 'annotations_sha256': annotation_sha}


def step_bounds(anchors, units):
    """Bound changes between adjacent long anchors; never correct their offsets.

    A change may lie anywhere between supports. Widen all potentially affected
    units, including crossing units, through the right bracketing anchor. Each
    adjacent pair bounds its own region; missing coverage fails closed.
    """
    require(len(anchors) >= 2, 'Missing bracketing long anchors')
    require(len({a['id'] for a in anchors}) == len(anchors), 'Duplicated long anchor')
    for anchor in anchors:
        require(anchor.get('method') != 'lead-marker' or (anchor is anchors[0] and anchor.get('validated') is True),
                'Lead marker may only be the first, validated anchor')
        require(anchor.get('validated') is True and anchor.get('method') in ('unique-exact-long-PCM', 'bounded-long-correlation', 'lead-marker')
                and (anchor['method'] != 'bounded-long-correlation'
                     or (anchor.get('unique') is True and len(anchor.get('methods', [])) == 3
                         and all(m.get('unique') is True for m in anchor['methods']))),
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
                          'magnitude_interval_s': [change-combined, change+combined],
                          'combined_anchor_uncertainty_s': combined,
                          'symmetric_uncertainty_s': abs(change)+combined,
                          'anchors': [before['id'], after['id']]})
    coverage_start = anchors[0]['recording_start_s']
    coverage_end = anchors[-1]['recording_end_s']
    if units:
        # Full-unit continuous placements are independent adjudications already
        # required by the scorer. They provide coverage, never extrapolated
        # source timing. Step locations still use only measured template support.
        by_id = {unit['id']: unit for unit in units}
        require(len(by_id) == len(units), 'Duplicated independently timed unit')
        first_long = next(a for a in anchors if a['method'] != 'lead-marker')
        for anchor, edge in ((first_long, 'start'), (anchors[-1], 'end')):
            if anchor['method'] != 'bounded-long-correlation':
                continue
            require(anchor['id'] in by_id, 'Missing full-unit timing for edge long anchor')
            boundary = by_id[anchor['id']]
            first, last_start, last = (boundary[k] for k in ('continuous_start_s',
                                      'continuous_last_word_start_s', 'continuous_last_word_end_s'))
            require(all(finite(v) for v in (first, last_start, last))
                    and first <= last_start <= last, 'Invalid independent full-unit timing')
            require(first <= anchor['recording_start_s']-anchor['uncertainty_s']
                    and anchor['recording_end_s']+anchor['uncertainty_s'] <= last,
                    'Measured template support outside independently timed full unit')
            if edge == 'start' and anchors[0]['method'] != 'lead-marker':
                coverage_start = first
            else:
                coverage_end = last
    for unit in units:
        require(coverage_start <= unit['continuous_start_s']
                and unit['continuous_last_word_end_s'] <= coverage_end,
                'Unit has no bracketing long-anchor coverage')
    return steps


def source_schedule(unit, first_anchor):
    """Explicit source endpoints, or the previous fixed first-anchor schedule."""
    keys = ('source_start_s', 'source_last_word_start_s', 'source_last_word_end_s')
    if any(k in unit for k in keys):
        require(all(k in unit for k in keys), 'Incomplete source speech endpoints')
        values = [unit[k] for k in keys]
        basis = 'source'
    else:
        baseline = unit.get('reference_schedule_offset_s', first_anchor['offset_s'])
        require(finite(baseline), 'Unsupported reference-schedule offset')
        values = [unit[k]-baseline for k in ('continuous_start_s', 'continuous_last_word_start_s', 'continuous_last_word_end_s')]
        basis = 'legacy-first-anchor-reference-schedule'
    require(all(finite(v) for v in values) and values[0] <= values[1] <= values[2], 'Unsupported source speech placement')
    return values, basis


def lead_marker_anchor(continuous_check, source_start_s, span_s=1.2):
    """Proposal: the lead marker as first anchor, so units before the first long anchor are placed.

    Offset = recorded continuous position minus the marker's source time, uncertainty = the marker's
    measured detection uncertainty. Used only when no long anchor precedes a unit. The span is the
    existing three 200 ms pulses at 500 ms spacing (1.2 s).
    """
    require(isinstance(continuous_check, dict) and continuous_check.get('valid') is True,
            'Lead marker needs a valid continuous marker check')
    lead = continuous_check['lead']
    require(all(finite(v) for v in (lead['position'], lead['uncertainty_s'], source_start_s, span_s))
            and lead['uncertainty_s'] >= 0 and span_s > 0, 'Unsupported lead marker')
    return {'id': 'lead-marker', 'source_start_s': source_start_s, 'source_end_s': source_start_s+span_s,
            'recording_start_s': lead['position'], 'recording_end_s': lead['position']+span_s,
            'offset_s': lead['position']-source_start_s, 'uncertainty_s': lead['uncertainty_s'],
            'method': 'lead-marker', 'validated': True}


def anchor_source_start(anchor):
    return anchor.get('source_utterance_start_s', anchor['source_start_s'])


def prepare_units(units, mapping, anchors):
    """Carry local offsets forward; only unresolved between-anchor steps widen."""
    steps = step_bounds(anchors, [])
    by_anchor = {a['id']: a for a in anchors}
    nominal_units = []
    for unit in units:
        (a, b, c), basis = source_schedule(unit, next(x for x in anchors if x['method'] != 'lead-marker'))
        preceding = [anchor for anchor in anchors if anchor_source_start(anchor) <= a]
        require(preceding, 'No preceding long anchor for source utterance')
        anchor = preceding[-1]
        shifted = [t+anchor['offset_s'] for t in (a, b, c)]
        nominal_units.append({**unit, 'continuous_start_s': shifted[0],
            'continuous_last_word_start_s': shifted[1], 'continuous_last_word_end_s': shifted[2],
            'source_start_s': a, 'source_last_word_start_s': b, 'source_last_word_end_s': c,
            'speech_time_basis': basis, 'timing_anchor_id': anchor['id'],
            'timing_anchor_offset_s': anchor['offset_s'], 'timing_anchor_uncertainty_s': anchor['uncertainty_s']})
    step_bounds(anchors, nominal_units)
    result = []
    for unit in nominal_units:
        a, b, c = (unit[k] for k in ('continuous_start_s', 'continuous_last_word_start_s', 'continuous_last_word_end_s'))
        def bracket_uncertainty(source_time):
            return sum(step['symmetric_uncertainty_s'] for step in steps
                       if by_anchor[step['anchors'][0]]['source_end_s'] < source_time
                       < by_anchor[step['anchors'][1]]['source_start_s'])
        end_step_u = bracket_uncertainty(unit['source_last_word_end_s'])
        start_step_u = bracket_uncertainty(unit['source_last_word_start_s'])
        onset_step_u = bracket_uncertainty(unit['source_start_s'])
        anchor_u = unit['timing_anchor_uncertainty_s']
        def interval(time, uncertainty):
            require(0 <= time-uncertainty <= time+uncertainty <= mapping['decoded_samples']/mapping['rate'],
                    'Speech uncertainty outside preserved continuous samples')
            # The upper acoustic bound can cross a chunk boundary even when its
            # nominal point does not. Include any intervening unassigned gap.
            return [placement_interval(time-uncertainty, mapping)[0],
                    placement_interval(time+uncertainty, mapping)[1]]
        end = interval(c, anchor_u+end_step_u)
        word_start = interval(b, anchor_u+start_step_u)
        onset = interval(a, anchor_u+onset_step_u)
        result.append({**unit, 'eligible': unit['eligible'], 'start': a, 'last_word_start': b,
                       'last_word_end': c, 'earliest_acoustic_end_s': end[0],
                       'latest_acoustic_end_s': end[1],
                       'last_word_start_interval_s': word_start, 'speech_start_interval_s': onset,
                       'speech_end_step_uncertainty_s': end_step_u,
                       'last_word_start_step_uncertainty_s': start_step_u,
                       'speech_start_step_uncertainty_s': onset_step_u,
                       'step_uncertainty_s': max(end_step_u, start_step_u, onset_step_u)})
    return result, steps
