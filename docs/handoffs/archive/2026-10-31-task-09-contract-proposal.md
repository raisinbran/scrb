# Task 9 — proposed TypeScript contract change (for owner review)

**Branch:** `rosmont/meeting-scribe-remaining-20261031`  
**Base main:** `7790843dcc29951d1edc2d3fe99c25f73dddeaae`  
**Status:** exact TypeScript proposal; **not applied to packages/contracts or runtime files**. The primary agent must review this patch before application and merging.

## Scope

Includes the approved-now Batch A items: `getUndoState`, `transcriptionFailed` status and safe optional failure reason, `retryFinalPass`, `meetingChanged`, `MeetingDetail.hasAudio`, and `importAudioFile.privacyBannerRequired`. Also documents Batch B's source-selection `conflict`, live-seek restrictions, picker-token lifecycle, and replacement semantics. The existing `CALL_NAMES`/`EVENT_NAMES` exports automatically drive **both** IPC allowlists in `src/main/dispatch.ts` and `src/preload/preload.ts`; adding parallel lists would create drift.

The following are approved **with later screens** and intentionally **not** in this first patch: import list, pause spans event, summary item add/remove, speaker suggestion listing, jurisdiction listing, vocabulary history actions and search filter. Model trial/profile rebuild/summary v4 remain deferred.

## Recommendations for the primary agent (undecided)

- On retry, verify **sealed readable audio**, exclude concurrent final-pass/import/export jobs, and preserve frozen corrections; return `conflict` on a deleted-audio meeting.
- Sanitize `transcriptionFailure`: exclude absolute paths, private transcript excerpts, names, or model stdout.
- The mock uses an Illinois-only privacy flag for its synthetic setting; the real backend must use editable jurisdiction rules (Task 22). Consider centralizing that check for both import and live.
- Search other typed `MeetingDetail` constructors before applying; `hasAudio` is a **required** field, not a nullable suggestion.
- Use the existing `Backend` contract; no new renderer-to-main escape hatch.

## Proposed unified diff

```diff
diff --git a/packages/contracts/src/backend.ts b/packages/contracts/src/backend.ts
--- a/packages/contracts/src/backend.ts
+++ b/packages/contracts/src/backend.ts
@@ -79,12 +79,13 @@
   pickAudioFile: { request: void; response: PickedAudioFile | null };
   importAudioFile: {
     request: { fileToken: string; buildVoiceProfiles: boolean };
-    response: { importId: ImportId };
+    response: { importId: ImportId; privacyBannerRequired: boolean };
   };
   /**
    * Asks a running import to stop. Every import ends in exactly one of `importFinished`,
    * `importFailed` or `importCancelled`, and only the last means no meeting exists. Cancelling an
-   * import that already ended, or cancelling twice, does nothing. An id that never existed is
+   * import that already ended, or cancelling twice, does nothing. Failure and cancellation both
+   * leave no meeting. An id that never existed is
    * `notFound`.
    */
   cancelImport: { request: { importId: ImportId }; response: void };
@@ -92,6 +93,7 @@
   // Devices
   listInputDevices: { request: void; response: InputDevice[] };
   listMeetingApps: { request: void; response: MeetingApp[] };
+  /** A changed selection while recording returns conflict; unchanged is harmless. */
   selectSources: { request: SourceSelection; response: void };
 
   /**
@@ -109,6 +111,8 @@
     request: { meetingId: MeetingId; offset: number; limit: number };
     response: TranscriptPage;
   };
+  /** Reads the saved correction history without creating another edit. */
+  getUndoState: { request: { meetingId: MeetingId }; response: UndoState };
   applyCorrection: {
     request: { meetingId: MeetingId; range: WordRange; text: string; remember: boolean };
     response: UndoState;
@@ -119,6 +123,7 @@
   };
   undo: { request: { meetingId: MeetingId }; response: UndoState };
   redo: { request: { meetingId: MeetingId }; response: UndoState };
+  /** While recording, only already sealed/readable audio can be sought. */
   seekAudio: { request: { meetingId: MeetingId; positionMs: number }; response: void };
   /** @addition */
   pauseAudio: { request: { meetingId: MeetingId }; response: void };
@@ -163,6 +168,8 @@
   listMeetings: { request: { filter?: MeetingFilter }; response: MeetingListItem[] };
   /** @addition */
   getMeeting: { request: { meetingId: MeetingId }; response: MeetingDetail };
+  /** Retries a failed pass on stopped, sealed audio; conflict when unavailable or busy. */
+  retryFinalPass: { request: { meetingId: MeetingId }; response: void };
   /** @addition */
   updateMeeting: {
     request: { meetingId: MeetingId; title?: string; startedAt?: string };
@@ -231,6 +238,8 @@
 
   // Library
   exportFinished: ExportFinished;
+  /** Notifies the list and detail when metadata or processing status changes. */
+  meetingChanged: MeetingListItem;
 
   // Settings
   modelDownloadProgress: ModelDownloadProgress;
@@ -306,6 +315,7 @@
   startAudioCheck: true,
   stopAudioCheck: true,
   getTranscript: true,
+  getUndoState: true,
   applyCorrection: true,
   reassignSpeaker: true,
   undo: true,
@@ -326,6 +336,7 @@
   updateSummaryItem: true,
   listMeetings: true,
   getMeeting: true,
+  retryFinalPass: true,
   updateMeeting: true,
   searchMeetings: true,
   deleteMeeting: true,
@@ -362,6 +373,7 @@
   summaryProgress: true,
   summaryOutdated: true,
   exportFinished: true,
+  meetingChanged: true,
   modelDownloadProgress: true,
 };
 
diff --git a/packages/contracts/src/types.ts b/packages/contracts/src/types.ts
--- a/packages/contracts/src/types.ts
+++ b/packages/contracts/src/types.ts
@@ -146,6 +146,7 @@
   sizeBytes: number;
   /** The file's date, used as the meeting's default date. */
   fileDate: string;
+  /** A successful import consumes this token; retry after failure requires a fresh pick. */
 }
 
 export type ImportStage = 'queued' | 'decoding' | 'transcribing' | 'diarizing' | 'finishing';
@@ -183,7 +184,7 @@
 // Meetings and transcript
 
 export type MeetingStatus =
-  'recording' | 'paused' | 'finalPassRunning' | 'ready' | 'recovered' | 'importing' | 'deleting';
+  'recording' | 'paused' | 'finalPassRunning' | 'transcriptionFailed' | 'ready' | 'recovered' | 'importing' | 'deleting';
 
 export type SummaryState = 'notGenerated' | 'generating' | 'ready' | 'edited' | 'outdated';
 
@@ -200,6 +201,10 @@
 }
 
 export interface MeetingDetail extends MeetingListItem {
+  /** False after audio-only deletion or if no readable audio was saved. */
+  hasAudio: boolean;
+  /** Safe user-visible reason for failed transcription, when known. */
+  transcriptionFailure?: string | null;
   /** Paused and missing spans, in timeline order. */
   gaps: TimelineGap[];
   /** Set on a recovered meeting: where the recording ended. */
@@ -244,7 +249,8 @@
   words: TranscriptWord[];
 }
 
-/** Change events are small: an 8-hour transcript is never resent whole. */
+/** Change events are small: an 8-hour transcript is never resent whole.
+ * On replace, remove removedSegmentIds first, then upsert segments by ID in timeline order. */
 export type TranscriptChange =
   | { kind: 'append'; segments: TranscriptSegment[] }
   | { kind: 'replace'; segments: TranscriptSegment[]; removedSegmentIds: SegmentId[] }
diff --git a/packages/contracts/src/validate.ts b/packages/contracts/src/validate.ts
--- a/packages/contracts/src/validate.ts
+++ b/packages/contracts/src/validate.ts
@@ -221,6 +221,7 @@
     offset: int(0, Number.MAX_SAFE_INTEGER),
     limit: int(1, MAX_TRANSCRIPT_PAGE),
   }),
+  getUndoState: meeting,
   applyCorrection: shape({ meetingId: id, range: wordRange, text: text(MAX_TEXT), remember: flag }),
   reassignSpeaker: shape({ meetingId: id, range: wordRange, speakerId: id }),
   undo: meeting,
@@ -262,6 +263,7 @@
     },
   ),
   getMeeting: meeting,
+  retryFinalPass: meeting,
   updateMeeting: shape({ meetingId: id }, { title: filled(MAX_NAME), startedAt: date }),
   searchMeetings: shape({ query: text(MAX_NAME) }),
   deleteMeeting: meeting,
diff --git a/apps/desktop/src/ui/mocks/mock-backend.ts b/apps/desktop/src/ui/mocks/mock-backend.ts
--- a/apps/desktop/src/ui/mocks/mock-backend.ts
+++ b/apps/desktop/src/ui/mocks/mock-backend.ts
@@ -323,7 +323,8 @@
       const segments = this.transcripts.get(meeting.id);
       if (segments) this.transcripts.set(meeting.id, segments.map(finalized));
       this.rewriteHistory(meeting.id, finalized);
-      this.updateMeetingStatus(meeting.id, { status: 'ready' });
+      this.updateMeetingStatus(meeting.id, { status: 'ready', transcriptionFailure: null });
+      this.emit('meetingChanged', toListItem(this.findMeeting(meeting.id)));
     }
   }
 
@@ -771,6 +772,7 @@
           summaryState: 'notGenerated',
           speakerCount: MOCK_SPEAKERS.length,
           gaps: [],
+          hasAudio: true,
         },
         ...this.library,
       ];
@@ -828,7 +830,7 @@
       this.pickedFiles.set(file.fileToken, file);
       return file;
     },
-    importAudioFile: ({ fileToken }) => {
+    importAudioFile: ({ fileToken, buildVoiceProfiles }) => {
       const importId = this.id('import');
       const { fileName, fileDate } = this.pickedFiles.get(fileToken) ?? PICKED_FILE;
       if (this.recording.status !== 'idle') {
@@ -836,12 +838,12 @@
           reason: 'recordingInProgress',
           message: 'A recording is running. Try this import again after the recording.',
         });
-        return { importId };
+        return { importId, privacyBannerRequired: buildVoiceProfiles && this.settings.location.usState === 'IL' };
       }
       for (const fault of ['importFails', 'importUnsupported', 'importDiskFull'] as const) {
         if (this.armed.delete(fault)) {
           this.failImportLater(importId, fileName, IMPORT_FAULTS[fault]);
-          return { importId };
+          return { importId, privacyBannerRequired: buildVoiceProfiles && this.settings.location.usState === 'IL' };
         }
       }
       this.runImportStages(importId, fileName, 0, () => {
@@ -857,12 +859,13 @@
             summaryState: 'notGenerated',
             speakerCount: 2,
             gaps: [],
+            hasAudio: true,
           },
           ...this.library,
         ];
         this.emit('importFinished', { importId, meetingId });
       });
-      return { importId };
+      return { importId, privacyBannerRequired: buildVoiceProfiles && this.settings.location.usState === 'IL' };
     },
     cancelImport: ({ importId }) => {
       if (this.endedImports.has(importId)) return;
@@ -908,6 +911,10 @@
         speakers: this.speakersOf(meetingId),
       };
     },
+    getUndoState: ({ meetingId }) => {
+      this.findMeeting(meetingId);
+      return this.undoStateOf(meetingId);
+    },
     applyCorrection: ({ meetingId, range, text, remember }) =>
       this.correct(meetingId, range, text, remember),
     reassignSpeaker: ({ meetingId, range, speakerId }) => {
@@ -1065,6 +1072,20 @@
         .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
         .map(toListItem),
     getMeeting: ({ meetingId }) => this.findMeeting(meetingId),
+    retryFinalPass: ({ meetingId }) => {
+      const meeting = this.findMeeting(meetingId);
+      if (meeting.status !== 'transcriptionFailed' || !meeting.hasAudio) {
+        throw new ContractError({ code: 'conflict', message: 'No failed pass with audio is available to retry.' });
+      }
+      this.updateMeetingStatus(meetingId, { status: 'finalPassRunning', transcriptionFailure: null });
+      this.emit('meetingChanged', toListItem(this.findMeeting(meetingId)));
+      setTimeout(() => {
+        const current = this.library.find((item) => item.id === meetingId);
+        if (current?.status !== 'finalPassRunning') return;
+        this.updateMeetingStatus(meetingId, { status: 'ready' });
+        this.emit('meetingChanged', toListItem(this.findMeeting(meetingId)));
+      }, SUMMARY_STEP_MS);
+    },
     updateMeeting: ({ meetingId, ...patch }) => {
       this.updateMeetingStatus(meetingId, patch);
       return this.findMeeting(meetingId);
diff --git a/apps/desktop/src/ui/mocks/fixtures.ts b/apps/desktop/src/ui/mocks/fixtures.ts
--- a/apps/desktop/src/ui/mocks/fixtures.ts
+++ b/apps/desktop/src/ui/mocks/fixtures.ts
@@ -100,8 +100,9 @@
   },
 ];
 
-const base: Pick<MeetingDetail, 'gaps' | 'speakerCount' | 'origin' | 'status' | 'summaryState'> = {
+const base: Pick<MeetingDetail, 'gaps' | 'speakerCount' | 'origin' | 'status' | 'summaryState' | 'hasAudio'> = {
   gaps: [],
+  hasAudio: true,
   speakerCount: 4,
   origin: 'recorded',
   status: 'ready',
diff --git a/packages/contracts/src/validate.test.ts b/packages/contracts/src/validate.test.ts
--- a/packages/contracts/src/validate.test.ts
+++ b/packages/contracts/src/validate.test.ts
@@ -8,6 +8,16 @@
     for (const name of CALL_NAMES) expect(() => isValidRequest(name, {})).not.toThrow();
   });
 
+  it('validates the new final-pass and undo calls against paths and extra fields', () => {
+    for (const name of ['getUndoState', 'retryFinalPass'] as const) {
+      expect(isValidRequest(name, { meetingId: 'meeting-1' })).toBe(true);
+      expect(isValidRequest(name, { meetingId: '../../private' })).toBe(false);
+      expect(isValidRequest(name, { meetingId: 'meeting-1', path: '/tmp' })).toBe(false);
+    }
+    expect(CALL_NAMES).toContain('getUndoState');
+    expect(CALL_NAMES).toContain('retryFinalPass');
+  });
+
   it('accepts no request for a call that takes none', () => {
     expect(isValidRequest('getSettings', undefined)).toBe(true);
     expect(isValidRequest('getSettings', { extra: true })).toBe(false);

```

## Verification

Diff generated from the listed files fetched at the named commit; every scripted old-text anchor was checked as unique. The proposal was not applied, and `npm run check`, smoke, cross-platform and native checks **were not run**. Validation and mock tests in the diff are proposed, not executed.
