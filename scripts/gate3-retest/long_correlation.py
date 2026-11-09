"""Bounded long-utterance matching using the retained interior-audit criteria.

Envelope time axes use each file's native sample rate, without audio resampling
or an affine correction. Uncertainty is the audit's method-sensitivity radius,
not a statistical confidence interval or a bound on unknown route biases.
"""
import math

SETTINGS = {
    'search_radius_s': 1.0, 'lag_step_s': .002, 'template_duration_s': 3.0,
    'methods': [{'frame_s': .010, 'log': True}, {'frame_s': .020, 'log': True},
                {'frame_s': .010, 'log': False}],
    'distinct_peak_exclusion_s': .100, 'minimum_diagnostic_ncc': .80,
    'minimum_secondary_peak_margin': .10, 'near_peak_drop': .01,
    'provenance': '2026-11-09 interior audit analysis-settings.json; unchanged criteria',
}


def envelope(samples, rate, start, frame, count, log=True):
    origin = round(start*rate)
    finish = origin+round(((count-1)*SETTINGS['lag_step_s']+frame)*rate)+2
    if origin < 0 or finish > len(samples):
        raise ValueError('Long-anchor search/template support outside preserved samples')
    squares = [0.0]
    for value in samples[origin:finish]:
        squares.append(squares[-1]+value*value)
    result = []
    for index in range(count):
        a = round(index*SETTINGS['lag_step_s']*rate)
        b = round((index*SETTINGS['lag_step_s']+frame)*rate)
        if b <= a:
            raise ValueError('Native rate cannot resolve envelope frames')
        value = math.sqrt(max(0, (squares[b]-squares[a])/(b-a)))
        result.append(math.log1p(value) if log else value)
    return result


def correlate(template, search):
    n = len(template)
    mean = sum(template)/n
    centered = [v-mean for v in template]
    energy = sum(v*v for v in centered)
    prefix, squares = [0.0], [0.0]
    for value in search:
        prefix.append(prefix[-1]+value)
        squares.append(squares[-1]+value*value)
    result = []
    for start in range(len(search)-n+1):
        variance = squares[start+n]-squares[start]-(prefix[start+n]-prefix[start])**2/n
        numerator = sum(centered[i]*search[start+i] for i in range(n))
        result.append(numerator/math.sqrt(energy*variance) if energy > 0 and variance > 0 else -1)
    return result


def peak_evidence(values, method):
    """Reproduce the interior audit's secondary peaks and near-top extent."""
    step, radius = SETTINGS['lag_step_s'], SETTINGS['search_radius_s']
    best = max(range(len(values)), key=values.__getitem__)
    others = [i for i in range(1, len(values)-1) if values[i] >= values[i-1] and values[i] > values[i+1]
              and abs(i-best)*step >= SETTINGS['distinct_peak_exclusion_s']]
    others += [i for i in (0, len(values)-1) if abs(i-best)*step >= SETTINGS['distinct_peak_exclusion_s']]
    second = max((values[i] for i in others), default=-1)
    left = right = best
    while left > 0 and values[left-1] >= values[best]-SETTINGS['near_peak_drop']:
        left -= 1
    while right < len(values)-1 and values[right+1] >= values[best]-SETTINGS['near_peak_drop']:
        right += 1
    unique = (values[best] >= SETTINGS['minimum_diagnostic_ncc']
              and values[best]-second >= SETTINGS['minimum_secondary_peak_margin']
              and 0 < best < len(values)-1)
    return {'method': method, 'best_ncc': values[best], 'second_peak_ncc': second,
            'margin': values[best]-second, 'lag_s': -radius+best*step, 'unique': unique,
            'near_peak_left_lag_s': -radius+left*step,
            'near_peak_right_lag_s': -radius+right*step,
            'near_peak_width_s': (right-left)*step,
            'search_boundary': best in (0, len(values)-1)}


def match_long_correlation(recording, recording_rate, source, source_rate, unit, expected):
    """Measure one source-only-selected 3 s support of an annotated long unit.

    Selection is fixed before observing the recording: start 100 ms inside its
    declared source span, as in the interior audit's passage guard. The complete
    source utterance remains eligible even when only its template is an anchor.
    """
    if unit.get('short') is not False:
        raise ValueError('Short-word matching is forbidden')
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (expected, source_rate, recording_rate)):
        raise ValueError('Nonfinite long-anchor clock/rate')
    a = unit['source_start_sample']/source_rate
    b = unit['source_end_sample']/source_rate
    if not 0 <= a < b <= len(source)/source_rate or b-a < 3.3:
        raise ValueError('Long utterance cannot contain the audit 3 s passage guard')
    start = a+.1
    # The last grid sample carries a forward frame: retain that support explicitly.
    count = round(SETTINGS['template_duration_s']/SETTINGS['lag_step_s'])
    methods = []
    for method in SETTINGS['methods']:
        x = envelope(source, source_rate, start, method['frame_s'], count, method['log'])
        y = envelope(recording, recording_rate, expected-1, method['frame_s'],
                     count+round(2/SETTINGS['lag_step_s']), method['log'])
        methods.append(peak_evidence(correlate(x, y), method))
    lag = methods[0]['lag_s']
    spread = max(abs(m['lag_s']-lag) for m in methods)
    extent = max(max(abs(m['near_peak_left_lag_s']-m['lag_s']),
                     abs(m['near_peak_right_lag_s']-m['lag_s'])) for m in methods)
    uncertainty = extent+spread+.010+.001+1/source_rate+1/recording_rate
    measured = expected+lag
    support = (count-1)*SETTINGS['lag_step_s']+.020
    valid = all(m['unique'] for m in methods)
    return {'id': unit['id'], 'source_start_s': start, 'source_end_s': start+support,
            'source_utterance_start_s': a, 'source_utterance_end_s': b,
            'recording_start_s': measured, 'recording_end_s': measured+support,
            'expected_recording_s': expected, 'offset_s': measured-start,
            'uncertainty_s': uncertainty, 'method_peak_spread_s': spread,
            'method': 'bounded-long-correlation', 'validated': valid, 'unique': valid,
            'methods': methods, 'uncertainty_basis': 'interior-audit near-top extent + method displacement + frame/grid/sample quantization; sensitivity radius'}


def detect_long_steps(recording, recording_rate, source, source_rate, utterances, offset):
    """Inspect every long unit on the continuous axis with a constant search offset."""
    from v3a_timing import step_bounds
    anchors = []
    try:
        for unit in utterances:
            if unit.get('short') is False:
                anchors.append(match_long_correlation(recording, recording_rate, source, source_rate, unit,
                               unit['source_start_sample']/source_rate+.1+offset))
            elif unit.get('short') is not True:
                raise ValueError('Missing explicit long/short source classification')
        steps = step_bounds(anchors, [])
        return {'timing': 'BOUNDED', 'anchors': anchors, 'steps': steps, 'settings': SETTINGS}
    except (ValueError, KeyError, TypeError) as error:
        return {'timing': 'INCONCLUSIVE', 'anchors': anchors, 'steps': [], 'error': str(error), 'settings': SETTINGS}


def annotation_units(annotations, rate):
    """Read source-only native-sample inventory or retained practice annotations.

    This only interprets existing annotations; it never freezes or changes them.
    The bounds scorer separately enforces frozen identity/eligibility binding.
    """
    if annotations.get('sample_rate') != rate:
        raise ValueError('Source annotation rate mismatch')
    units = annotations['utterances']
    if len({u['id'] for u in units}) != len(units):
        raise ValueError('Duplicated source unit')
    result = []
    end = 0
    for unit in units:
        start = unit.get('source_start_sample')
        finish = unit.get('source_end_sample')
        if start is None or finish is None:
            start, finish = round(unit['crop_start']*rate), round(unit['crop_end_bound']*rate)
        if type(unit['short']) is not bool or not end <= start < finish:
            raise ValueError('Missing, reordered or inconsistent source unit')
        result.append({**unit, 'source_start_sample': start, 'source_end_sample': finish})
        end = finish
    return result
