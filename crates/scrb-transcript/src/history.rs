//! Undo and redo of user edits, and which history entries a final pass leaves in place.

use std::collections::HashSet;

use crate::file::{HistoryEntry, Patch, Transcript, push_entry};

/// Which value of each patch to put back.
#[derive(Debug, Clone, Copy)]
enum Side {
    Before,
    After,
}

impl Transcript {
    /// Takes back the newest edit on the undo list and moves it to the redo list.
    ///
    /// With an empty undo list the transcript comes back unchanged, with the same `revision`.
    pub fn undo(&self) -> Transcript {
        let mut next = self.clone();
        if let Some(entry) = next.history.undo.pop() {
            next.apply_entry(&entry, Side::Before);
            push_entry(&mut next.history.redo, entry);
            next.revision += 1;
        }
        next
    }

    /// Makes the newest edit on the redo list again and moves it back to the undo list.
    ///
    /// With an empty redo list the transcript comes back unchanged, with the same `revision`.
    pub fn redo(&self) -> Transcript {
        let mut next = self.clone();
        if let Some(entry) = next.history.redo.pop() {
            next.apply_entry(&entry, Side::After);
            push_entry(&mut next.history.undo, entry);
            next.revision += 1;
        }
        next
    }

    /// Keeps only the history entries that touch no speaker or override and whose corrections
    /// name only words that still exist. A final pass replaces speakers and words, so the other
    /// entries would put back records that point at nothing.
    pub(crate) fn keep_history_safe_after_pass(&mut self) {
        let word_ids: HashSet<String> = self
            .segments
            .iter()
            .flat_map(|segment| &segment.words)
            .map(|word| word.id.clone())
            .collect();
        let safe = |entry: &HistoryEntry| {
            entry.speakers.is_empty()
                && entry.overrides.is_empty()
                && entry
                    .corrections
                    .iter()
                    .flat_map(|patch| patch.before.iter().chain(&patch.after))
                    .flat_map(|correction| &correction.word_ids)
                    .all(|id| word_ids.contains(id))
        };
        self.history.undo.retain(safe);
        self.history.redo.retain(safe);
    }

    fn apply_entry(&mut self, entry: &HistoryEntry, side: Side) {
        apply_patches(&mut self.corrections, &entry.corrections, side, |c| &c.id);
        apply_patches(&mut self.speakers, &entry.speakers, side, |s| &s.id);
        apply_patches(&mut self.speaker_overrides, &entry.overrides, side, |o| {
            &o.id
        });
    }
}

/// Puts each patch's `side` value in place of the record with its id. `None` removes the
/// record, and a record that is missing is added at the end.
fn apply_patches<T: Clone>(
    records: &mut Vec<T>,
    patches: &[Patch<T>],
    side: Side,
    id_of: fn(&T) -> &String,
) {
    for patch in patches {
        let value = match side {
            Side::Before => &patch.before,
            Side::After => &patch.after,
        };
        let slot = records.iter().position(|record| *id_of(record) == patch.id);
        match (slot, value) {
            (Some(index), Some(value)) => records[index] = value.clone(),
            (Some(index), None) => {
                records.remove(index);
            }
            (None, Some(value)) => records.push(value.clone()),
            (None, None) => {}
        }
    }
}
