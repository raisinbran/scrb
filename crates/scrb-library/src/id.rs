use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::LibraryError;

/// A meeting's id, a random UUID in lowercase, such as `0b7d1f2e-4c1a-4e8b-9d6f-2a5c3e7b1f00`.
///
/// It holds only hex digits and hyphens, so a path built from it, such as `cache/<id>`, stays
/// inside the library.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct MeetingId(String);

impl MeetingId {
    /// A new random id, for a meeting the library has not seen before.
    pub fn new_random() -> Self {
        let high = random_u64();
        let low = random_u64();
        // Mark it as a random UUID, version 4 with variant bits 10.
        let high = (high & !0xf000) | 0x4000;
        let low = (low >> 2) | (1 << 63);
        Self(format!(
            "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
            high >> 32,
            (high >> 16) & 0xffff,
            high & 0xffff,
            low >> 48,
            low & 0xffff_ffff_ffff
        ))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for MeetingId {
    type Err = LibraryError;

    /// Accepts only the lowercase UUID form [`MeetingId::new_random`] makes.
    fn from_str(text: &str) -> Result<Self, LibraryError> {
        let is_uuid = text.len() == 36
            && text.char_indices().all(|(index, c)| match index {
                8 | 13 | 18 | 23 => c == '-',
                _ => c.is_ascii_digit() || ('a'..='f').contains(&c),
            });
        if is_uuid {
            Ok(Self(text.to_owned()))
        } else {
            Err(LibraryError::InvalidMeetingId(text.to_owned()))
        }
    }
}

impl TryFrom<String> for MeetingId {
    type Error = LibraryError;

    fn try_from(text: String) -> Result<Self, LibraryError> {
        text.parse()
    }
}

impl From<MeetingId> for String {
    fn from(id: MeetingId) -> Self {
        id.0
    }
}

/// A random number from the keys std seeds from the operating system for each `RandomState`.
/// Good for ids and temporary names, not for secrets.
pub(crate) fn random_u64() -> u64 {
    RandomState::new().build_hasher().finish()
}
