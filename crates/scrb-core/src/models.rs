//! App details for the Help screen's About section.

use scrb_protocol::AppInfo;

/// Shown as the build date when the build did not set `SCRB_BUILD_DATE`, as in every
/// developer build.
const UNDATED_BUILD: &str = "Development build";

pub fn app_info(app_name: &str, app_version: &str) -> AppInfo {
    AppInfo {
        name: app_name.to_owned(),
        version: app_version.to_owned(),
        build_date: option_env!("SCRB_BUILD_DATE")
            .unwrap_or(UNDATED_BUILD)
            .to_owned(),
        copyright: "Copyright 2026 the Meeting Scribe authors".to_owned(),
        storage_statement:
            "Your recordings, transcripts and voice data are stored only on this computer."
                .to_owned(),
        // Model details are added once model setup exists.
        models: Vec::new(),
    }
}
