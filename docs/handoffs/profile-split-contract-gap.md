# Split a voice profile: contract gap

**From:** UI (Speakers redesign). **To:** backend/contract owner. **Status:** open, nothing built.

The Speakers detail card shows **Split into…** next to Rename, Merge into… and Delete. Merge and Rename work on profiles (`mergeSpeakers` kind `profiles`, `renameSpeaker` target `profile`), but `splitSpeaker` only takes `{ meetingId, range, newLabel }`: it splits a speaker inside one meeting. The contract has no call to split a voice profile into two, and `ProfileClip` lists only up to three sample passages, not every meeting a profile appears in.

Until this is decided the button is disabled with the tooltip "To split a speaker, open the meeting in Recordings and use its Speakers tab." That path works today: the meeting's Speakers tab has Split into… per speaker.

To enable it on the profile card the UI needs, with owner approval in `packages/contracts/APPROVALS.md`: a way to list the meetings a profile appears in (or its passages), and a profile-level split call, for example `splitProfile { profileId, passages: PassageRef[], newName }` returning the new `ProfileId`. The UI would then reuse the meeting split dialog's passage picker.
