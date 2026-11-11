"""classify-unidentified.py on invented, hand-made inputs: one case per class, and the scroll-window reader."""
import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('classify_unidentified', Path(__file__).with_name('classify-unidentified.py'))
classify_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(classify_module)


def matcher_row(words, **changes):
    return {'id': 'microphone-001', 'short': False, 'source_start_s': 10.5, 'source_last_word_end_s': 12.0,
            'reference_words': words, 'endpoint_missing_in_optimal_alignment': False,
            'repetition_identity_unresolved': False, 'identity_unique': True,
            'other_words_exact_fraction': 1.0, 'candidate_publication_ids': [], **changes}


def tree(*texts, visible=1):
    return {'0:10': {'samples': 1, 'first': 0, 'texts': list(texts), 'visible_samples': visible}}


def published(*texts):
    return {'0:10': {i: {'text': t, 'u': .1} for i, t in enumerate(texts)}}


TABLES = [{'end': 12.0, 'rows_in_tree': 2}]


def run(row, seen, pub):
    return classify_module.classify(row, seen, pub, TABLES, 0.0, [], [])


class Classes(unittest.TestCase):
    words = ['open', 'the', 'front', 'door']

    def test_a_no_row_ever_entered_the_tree(self):
        result = run(matcher_row(self.words), {}, {})
        self.assertEqual(result['class'], 'a')
        self.assertEqual(result['row_times_in_tree'], [])
        self.assertEqual(result['id'], 'microphone-001')

    def test_b_words_in_the_tree_but_never_published(self):
        result = run(matcher_row(self.words), tree(*self.words, visible=0), {})
        self.assertEqual(result['class'], 'b')
        self.assertEqual(result['tree_coverage'], 1.0)
        self.assertEqual(result['published_coverage'], 0.0)

    def test_c_a_different_final_word_is_displayed(self):
        shown = ['open', 'the', 'front', 'window']
        result = run(matcher_row(self.words), tree(*shown), published(*shown))
        self.assertEqual(result['class'], 'c')
        self.assertEqual(result['displayed_where_final_word_should_be'], ['window'])

    def test_d_published_with_the_right_final_word_reports_the_matcher_reason(self):
        row = matcher_row(self.words, identity_unique=False)
        result = run(row, tree(*self.words), published(*self.words))
        self.assertEqual(result['class'], 'd')
        self.assertIn('endpoint claimed by more than one unit or ambiguous', result['matcher']['reasons'])

    def test_every_result_keeps_the_unit_interval_and_the_raw_observations(self):
        result = run(matcher_row(self.words), tree(*self.words), published(*self.words))
        for key in ('id', 'source_start_s', 'source_end_s', 'row_times_in_tree', 'tree_coverage', 'published_coverage',
                    'rows_ever_in_viewport', 'first_sample_with_rows', 'uncovered_speech_s', 'matcher', 'reference'):
            self.assertIn(key, result)
        self.assertEqual((result['source_start_s'], result['source_end_s']), (10.5, 12.0))
        self.assertEqual(result['reference'], 'open the front door')


class Helpers(unittest.TestCase):
    def test_row_time_text_is_minutes_and_seconds(self):
        self.assertEqual(classify_module.seconds('3:10'), 190)
        self.assertEqual(classify_module.seconds('0:05'), 5)

    def test_scroll_windows_open_at_scroll_up_and_close_at_jump_to_live(self):
        lines = ['1000\tx\tscroll: up 3', '3000\tx\tpressed \'Jump to Live\'', '5000\tx\tscroll: up 1', 'header\tx\ty']
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'actions.tsv'
            path.write_text('\n'.join(lines), encoding='utf-8')
            windows = classify_module.scroll_windows(path, origin=0, frequency=1000, shift=100.0)
        self.assertEqual(windows, [[101.0, 103.0]])   # the final scroll never closed, so it is not a window


if __name__ == '__main__':
    unittest.main()
