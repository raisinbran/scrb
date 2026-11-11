use std::fmt;

/// Why a transcript edit was refused. A refused edit changes nothing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TranscriptError {
    /// The selection names no words.
    EmptySelection,
    /// A selected word is not in the transcript. Holds its id.
    WordNotFound(String),
    /// The selected words are not one unbroken run of one track, in reading order.
    NotConsecutive,
    /// The selection covers only part of an active correction. Holds that correction's id.
    CutsThroughCorrection(String),
    /// No correction has this id.
    CorrectionNotFound(String),
    /// A merge would have lost a frozen word or split an active correction, so it was refused.
    /// Holds the correction's id.
    CorrectionLost(String),
}

impl fmt::Display for TranscriptError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptySelection => write!(f, "Select at least one word."),
            Self::WordNotFound(_) => write!(f, "A selected word is no longer in the transcript."),
            Self::NotConsecutive => write!(f, "Select words that follow each other on one track."),
            Self::CutsThroughCorrection(_) => {
                write!(
                    f,
                    "The selection covers only part of an earlier correction."
                )
            }
            Self::CorrectionNotFound(_) => write!(f, "That correction is no longer there."),
            Self::CorrectionLost(_) => {
                write!(
                    f,
                    "The new transcript would have lost a correction, so the change was refused."
                )
            }
        }
    }
}

impl std::error::Error for TranscriptError {}
