use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use unicode_normalization::UnicodeNormalization;

use crate::LibraryError;

/// The longest title part of a folder name, in characters. It leaves room under Windows' path
/// limit.
const TITLE_LIMIT: usize = 60;

/// Makes the folder `<date> <title>` under `meetings`, such as `2026-11-12 Weekly sync`, and
/// returns its name.
///
/// When the name is taken, ` (2)`, ` (3)` and so on are added. The `create_dir` call is the check
/// for a free name, so two creates at once never get the same folder.
pub(crate) fn create_meeting_folder(
    meetings: &Path,
    date: &str,
    title: &str,
) -> Result<String, LibraryError> {
    let base = format!("{} {}", folder_day(date)?, safe_title(title));
    let mut name = base.clone();
    let mut copy = 1;
    loop {
        match fs::create_dir(meetings.join(&name)) {
            Ok(()) => return Ok(name),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                copy += 1;
                name = format!("{base} ({copy})");
            }
            Err(error) => return Err(error.into()),
        }
    }
}

/// The `YYYY-MM-DD` that starts an ISO 8601 date.
fn folder_day(date: &str) -> Result<&str, LibraryError> {
    let day = date.get(..10).unwrap_or_default();
    let is_day = day.char_indices().all(|(index, c)| match index {
        4 | 7 => c == '-',
        _ => c.is_ascii_digit(),
    });
    if day.len() == 10 && is_day {
        Ok(day)
    } else {
        Err(LibraryError::InvalidDate(date.to_owned()))
    }
}

/// The title made safe for a folder name on Windows, macOS and network folders. It holds no
/// path separator and never starts or ends with a dot or a space.
fn safe_title(title: &str) -> String {
    let mut spaced = String::new();
    for c in title.nfc() {
        let c = if c.is_control() || r#"<>:"/\|?*"#.contains(c) {
            ' '
        } else {
            c
        };
        if !(c == ' ' && spaced.ends_with(' ')) {
            spaced.push(c);
        }
    }
    let cut: String = spaced.chars().take(TITLE_LIMIT).collect();
    let trimmed = cut.trim_matches(['.', ' ']);
    if trimmed.is_empty() || is_reserved_on_windows(trimmed) {
        "Meeting".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Device names Windows reserves in any case, such as `con` or `COM1`.
fn is_reserved_on_windows(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    let numbered = (upper.starts_with("COM") || upper.starts_with("LPT"))
        && upper.len() == 4
        && upper.as_bytes()[3].is_ascii_digit();
    numbered || matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
}
