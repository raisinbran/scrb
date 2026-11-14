/**
 * Stale-result protection for background sorts. The caller keeps `revision` in
 * outline.json (bumped on every pin change, outline save and transcript replace).
 * A sort result is written only if its run is still the latest and the revision is unchanged.
 */
export interface SortRun {
  runId: number;
  revision: number;
}

export class SortGuard {
  private latest = 0;

  /** Begin a run against the revision it will read. */
  start(revision: number): SortRun {
    this.latest += 1;
    return { runId: this.latest, revision };
  }

  /** Cancel: any run started so far is superseded, so a late finish is dropped. */
  cancel(): void {
    this.latest += 1;
  }

  /** True only if the result may be written. */
  canCommit(run: SortRun, currentRevision: number): boolean {
    return run.runId === this.latest && run.revision === currentRevision;
  }
}
