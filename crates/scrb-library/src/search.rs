use std::fs;
use std::panic;
use std::path::{Path, PathBuf};
use std::thread;

use scrb_transcript::Transcript;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

use crate::library::{MEETINGS_FOLDER, TRANSCRIPT_FILE};
use crate::{IndexedMeeting, Library, LibraryError, MeetingId, MeetingStatus};

/// The most transcript matches one meeting returns.
const MATCH_LIMIT: usize = 20;
/// How many shown words a snippet keeps on each side of a match's first word.
const SNIPPET_WORDS: usize = 8;
/// How many transcripts are read at once.
const READERS: usize = 4;

/// What a search found.
#[derive(Debug, Default, PartialEq)]
pub struct SearchResults {
    /// Each meeting with a match, in the meeting list's order.
    pub meetings: Vec<MeetingMatches>,
    /// Meetings whose transcript could not be read, so the results may miss some of their text.
    pub skipped: Vec<MeetingId>,
}

/// One meeting a search found.
#[derive(Debug, PartialEq)]
pub struct MeetingMatches {
    pub meeting: IndexedMeeting,
    /// The query is in the title or the date.
    pub title_or_date: bool,
    /// At most 20 matches in the shown text, in transcript order.
    pub transcript: Vec<TranscriptMatch>,
}

/// One place the query is in a meeting's shown text.
#[derive(Debug, PartialEq)]
pub struct TranscriptMatch {
    /// The segment that holds the match's first word.
    pub segment_id: String,
    /// The start of the match's first word on the meeting clock.
    pub start_ms: u64,
    /// The shown words around the match, at most 8 on each side, joined by spaces.
    pub snippet: String,
}

impl Library {
    /// Finds `query` in each meeting's title, date and text as the screens show it, with
    /// corrections applied. Matching ignores case, accents and punctuation, and a phrase can run
    /// across segments and speakers.
    ///
    /// Meetings that are `importing` are left out. A query with no letters or digits finds
    /// nothing.
    pub fn search(&self, query: &str) -> Result<SearchResults, LibraryError> {
        let query = fold(query);
        let mut results = SearchResults::default();
        if query.is_empty() {
            return Ok(results);
        }
        let mut meetings = Vec::new();
        for meeting in self.meetings()? {
            if meeting.status != MeetingStatus::Importing {
                let name = self.folder_name(&meeting.id).ok();
                let folder = name.map(|name| self.root.join(MEETINGS_FOLDER).join(name));
                meetings.push((meeting, folder));
            }
        }

        // Each reader takes one run of the list, so joining the runs in order keeps the list's
        // order.
        let run = meetings.len().div_ceil(READERS).max(1);
        let found: Vec<Option<Vec<TranscriptMatch>>> = thread::scope(|scope| {
            let readers: Vec<_> = meetings
                .chunks(run)
                .map(|chunk| {
                    let read = |(_, folder): &(_, Option<PathBuf>)| {
                        folder
                            .as_deref()
                            .and_then(|folder| search_folder(folder, &query))
                    };
                    scope.spawn(move || chunk.iter().map(read).collect::<Vec<_>>())
                })
                .collect();
            readers
                .into_iter()
                .flat_map(|reader| {
                    reader
                        .join()
                        .unwrap_or_else(|error| panic::resume_unwind(error))
                })
                .collect()
        });

        for ((meeting, _), found) in meetings.into_iter().zip(found) {
            let title_or_date =
                fold(&meeting.title).contains(&query) || fold(&meeting.date).contains(&query);
            let transcript = found.unwrap_or_else(|| {
                results.skipped.push(meeting.id.clone());
                Vec::new()
            });
            if title_or_date || !transcript.is_empty() {
                results.meetings.push(MeetingMatches {
                    meeting,
                    title_or_date,
                    transcript,
                });
            }
        }
        Ok(results)
    }
}

/// The matches in `folder`'s `transcript.json`, or `None` when it cannot be read.
fn search_folder(folder: &Path, query: &str) -> Option<Vec<TranscriptMatch>> {
    let bytes = fs::read(folder.join(TRANSCRIPT_FILE)).ok()?;
    let transcript: Transcript = serde_json::from_slice(&bytes).ok()?;
    Some(find_matches(&transcript, query))
}

/// The first 20 places the folded `query` starts in the shown words. The words are folded and
/// joined by single spaces, so a phrase can run across segments and speakers.
fn find_matches(transcript: &Transcript, query: &str) -> Vec<TranscriptMatch> {
    let segments = transcript.shown_segments();
    // Each shown word with its segment id, and where its folded text starts in `text`.
    let mut words = Vec::new();
    let mut starts = Vec::new();
    let mut text = String::new();
    for segment in &segments {
        for word in &segment.words {
            let folded = fold(&word.text);
            if folded.is_empty() {
                continue;
            }
            if !text.is_empty() {
                text.push(' ');
            }
            starts.push(text.len());
            text.push_str(&folded);
            words.push((segment.id.as_str(), word));
        }
    }

    let mut matches = Vec::new();
    for (at, _) in text.match_indices(query).take(MATCH_LIMIT) {
        let index = starts.partition_point(|&start| start <= at) - 1;
        let (segment_id, word) = words[index];
        let first = index.saturating_sub(SNIPPET_WORDS);
        let last = (index + SNIPPET_WORDS).min(words.len() - 1);
        let around: Vec<&str> = words[first..=last]
            .iter()
            .map(|(_, word)| word.text.as_str())
            .collect();
        matches.push(TranscriptMatch {
            segment_id: segment_id.to_owned(),
            start_ms: word.start_ms,
            snippet: around.join(" "),
        });
    }
    matches
}

/// `text` as search compares it, such as `cafe ok` for `Café, OK?`. It is normalized to Unicode
/// NFKD, loses combining marks and everything but letters, digits and spaces, and is lowercased,
/// with each run of spaces made one.
fn fold(text: &str) -> String {
    let kept: String = text
        .nfkd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();
    kept.split_whitespace().collect::<Vec<_>>().join(" ")
}
