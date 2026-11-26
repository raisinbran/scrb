import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { StorageError } from '../errors.ts';

export interface VoiceProfile {
  id: string;
  name: string | null;
  modelId: string;
  embedding: Float32Array;
  sampleCount: number;
  meetingIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** What one meeting added to a profile: a speaker's voice and how many segments it came from. */
export interface VoiceContribution {
  profileId: string;
  meetingId: string;
  embedding: Float32Array;
  sampleCount: number;
  modelId: string;
}

/** A profile with everything undo must restore: the kept flag and each contribution. */
type ProfileSnapshot = VoiceProfile & { kept: boolean; contributions: VoiceContribution[] };

interface ProfileChange {
  kind: 'rename' | 'merge';
  ids: string[];
  before: ProfileSnapshot[];
  after: ProfileSnapshot[];
}

interface ContributionRow {
  profile_id: string;
  meeting_id: string;
  embedding: Uint8Array;
  sample_count: number;
  model_id: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  model_id: string;
  embedding: Uint8Array;
  sample_count: number;
  kept: number;
  created_at: string;
  updated_at: string;
}

function toBlob(embedding: Float32Array): Uint8Array {
  return new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

function fromBlob(blob: Uint8Array): Float32Array {
  // Copied, as the blob may not sit on a 4-byte boundary.
  const copy = blob.slice();
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

/** Average weighted by how many samples each side has seen. */
function mergeEmbeddings(
  a: Float32Array,
  aCount: number,
  b: Float32Array,
  bCount: number,
): Float32Array {
  if (a.length !== b.length) {
    throw new StorageError('EMBEDDING_SIZE', 'Embeddings come from different models');
  }
  const merged = new Float32Array(a.length);
  const total = aCount + bCount;
  for (let i = 0; i < a.length; i += 1) {
    merged[i] = ((a[i] as number) * aCount + (b[i] as number) * bCount) / total;
  }
  return merged;
}

/** Mean of the contributions, each weighted by its segment count. */
export function weightedMean(parts: { embedding: Float32Array; sampleCount: number }[]): {
  embedding: Float32Array;
  sampleCount: number;
} {
  const first = parts[0];
  if (!first) throw new StorageError('EMBEDDING_SIZE', 'No contributions to combine');
  const sum = new Float64Array(first.embedding.length);
  let total = 0;
  for (const part of parts) {
    if (part.embedding.length !== sum.length) {
      throw new StorageError('EMBEDDING_SIZE', 'Embeddings come from different models');
    }
    for (let i = 0; i < sum.length; i += 1) {
      sum[i] = (sum[i] as number) + (part.embedding[i] as number) * part.sampleCount;
    }
    total += part.sampleCount;
  }
  return { embedding: Float32Array.from(sum, (value) => value / total), sampleCount: total };
}

/** Voice profiles: speaker embeddings (number lists), never audio clips. */
export class VoiceProfileStore {
  private readonly db: DatabaseSync;
  private readonly now: () => string;
  private undoStack: ProfileChange[] = [];
  private redoStack: ProfileChange[] = [];

  constructor(db: DatabaseSync, now: () => string) {
    this.db = db;
    this.now = now;
  }

  private hydrate(row: ProfileRow): VoiceProfile {
    const links = this.db
      .prepare('SELECT meeting_id FROM voice_profile_meetings WHERE profile_id = ?')
      .all(row.id) as unknown as { meeting_id: string }[];
    return {
      id: row.id,
      name: row.name,
      modelId: row.model_id,
      embedding: fromBlob(row.embedding),
      sampleCount: row.sample_count,
      meetingIds: links.map((link) => link.meeting_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(modelId?: string): VoiceProfile[] {
    const rows =
      modelId === undefined
        ? this.db.prepare('SELECT * FROM voice_profiles ORDER BY name, id').all()
        : this.db
            .prepare('SELECT * FROM voice_profiles WHERE model_id = ? ORDER BY name, id')
            .all(modelId);
    return (rows as unknown as ProfileRow[]).map((row) => this.hydrate(row));
  }

  get(id: string): VoiceProfile | null {
    const row = this.db.prepare('SELECT * FROM voice_profiles WHERE id = ?').get(id);
    return row === undefined ? null : this.hydrate(row as unknown as ProfileRow);
  }

  private link(profileId: string, meetingId: string | undefined): void {
    if (meetingId === undefined) return;
    this.db
      .prepare(
        'INSERT OR IGNORE INTO voice_profile_meetings (profile_id, meeting_id) VALUES (?, ?)',
      )
      .run(profileId, meetingId);
  }

  create(input: {
    modelId: string;
    embedding: Float32Array;
    sampleCount?: number;
    name?: string;
    meetingId?: string;
  }): VoiceProfile {
    const id = randomUUID();
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO voice_profiles
           (id, name, model_id, embedding, sample_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name ?? null,
        input.modelId,
        toBlob(input.embedding),
        input.sampleCount ?? 1,
        now,
        now,
      );
    this.link(id, input.meetingId);
    return this.get(id) as VoiceProfile;
  }

  /** Folds new samples from a meeting into the profile. */
  grow(id: string, embedding: Float32Array, sampleCount: number, meetingId?: string): void {
    const profile = this.get(id);
    if (profile === null) throw new StorageError('PROFILE_NOT_FOUND', 'No such voice profile');
    const merged = mergeEmbeddings(profile.embedding, profile.sampleCount, embedding, sampleCount);
    this.db
      .prepare(
        'UPDATE voice_profiles SET embedding = ?, sample_count = ?, updated_at = ? WHERE id = ?',
      )
      .run(toBlob(merged), profile.sampleCount + sampleCount, this.now(), id);
    this.link(id, meetingId);
  }

  undoState() {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      nextUndo: this.undoStack.at(-1)?.kind ?? null,
      nextRedo: this.redoStack.at(-1)?.kind ?? null,
    };
  }

  private snapshot(ids: string[]): ProfileSnapshot[] {
    return ids.flatMap((id) => {
      const profile = this.get(id);
      if (profile === null) return [];
      const kept = this.isKept(id);
      return [{ ...profile, kept, contributions: this.contributions(id) }];
    });
  }

  private same(a: ProfileSnapshot[], b: ProfileSnapshot[]): boolean {
    const normalize = (items: ProfileSnapshot[]) =>
      items
        .map((profile) => ({
          ...profile,
          embedding: Array.from(profile.embedding),
          meetingIds: [...profile.meetingIds].sort(),
          contributions: profile.contributions
            .map((c) => ({ ...c, embedding: Array.from(c.embedding) }))
            .sort((x, y) => x.meetingId.localeCompare(y.meetingId)),
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
    return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  }

  private remember(change: ProfileChange): void {
    this.undoStack.push(change);
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
  }

  private restore(change: ProfileChange, profiles: ProfileSnapshot[]): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of change.ids) {
        this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(id);
      }
      for (const profile of profiles) {
        this.db
          .prepare(
            'INSERT INTO voice_profiles (id, name, model_id, embedding, sample_count, kept, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            profile.id,
            profile.name,
            profile.modelId,
            toBlob(profile.embedding),
            profile.sampleCount,
            profile.kept ? 1 : 0,
            profile.createdAt,
            profile.updatedAt,
          );
        for (const meetingId of profile.meetingIds) this.link(profile.id, meetingId);
        for (const c of profile.contributions) this.writeContribution(c);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private moveHistory(
    from: ProfileChange[],
    to: ProfileChange[],
    undoing: boolean,
  ): ReturnType<VoiceProfileStore['undoState']> {
    const change = from.at(-1);
    if (!change) return this.undoState();
    if (!this.same(this.snapshot(change.ids), undoing ? change.after : change.before)) {
      from.pop();
      throw new StorageError('PROFILE_CHANGED', 'Profiles changed since the edit.');
    }
    this.restore(change, undoing ? change.before : change.after);
    from.pop();
    to.push(change);
    return this.undoState();
  }

  undo(): ReturnType<VoiceProfileStore['undoState']> {
    return this.moveHistory(this.undoStack, this.redoStack, true);
  }

  redo(): ReturnType<VoiceProfileStore['undoState']> {
    return this.moveHistory(this.redoStack, this.undoStack, false);
  }

  rename(id: string, name: string | null): void {
    const before = this.snapshot([id]);
    this.db
      .prepare('UPDATE voice_profiles SET name = ?, kept = ?, updated_at = ? WHERE id = ?')
      .run(name, name === null ? 0 : 1, this.now(), id);
    const after = this.snapshot([id]);
    if (before.length && !this.same(before, after)) {
      this.remember({ kind: 'rename', ids: [id], before, after });
    }
  }

  /** Folds `fromId` into `intoId`, then removes `fromId`. */
  merge(fromId: string, intoId: string): void {
    const from = this.get(fromId);
    const into = this.get(intoId);
    if (from === null || into === null || fromId === intoId) {
      throw new StorageError('PROFILE_NOT_FOUND', 'Cannot merge those voice profiles');
    }
    if (from.modelId !== into.modelId) {
      throw new StorageError('EMBEDDING_SIZE', 'Profiles come from different speaker models');
    }
    const ids = [fromId, intoId];
    const before = this.snapshot(ids);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.grow(intoId, from.embedding, from.sampleCount);
      for (const meetingId of from.meetingIds) this.link(intoId, meetingId);
      // The grow above already holds both profiles' voices, so only the rows move: a meeting in
      // both is combined into one row, and no mean is recomputed.
      for (const moved of this.contributions(fromId)) {
        const existing = this.contribution(intoId, moved.meetingId);
        const combined = existing ? weightedMean([existing, moved]) : moved;
        this.writeContribution({ ...moved, ...combined, profileId: intoId });
      }
      if (this.isKept(fromId)) {
        this.db.prepare('UPDATE voice_profiles SET kept = 1 WHERE id = ?').run(intoId);
      }
      this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(fromId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.remember({ kind: 'merge', ids, before, after: this.snapshot(ids) });
  }

  private isKept(id: string): boolean {
    const row = this.db.prepare('SELECT kept FROM voice_profiles WHERE id = ?').get(id) as
      { kept: number } | undefined;
    return row?.kept === 1;
  }

  private toContribution(row: ContributionRow): VoiceContribution {
    return {
      profileId: row.profile_id,
      meetingId: row.meeting_id,
      embedding: fromBlob(row.embedding),
      sampleCount: row.sample_count,
      modelId: row.model_id,
    };
  }

  /** Every contribution of one profile. Plain links (no voice) are not listed. */
  contributions(profileId: string): VoiceContribution[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM voice_profile_meetings WHERE profile_id = ? AND embedding IS NOT NULL ORDER BY meeting_id',
        )
        .all(profileId) as unknown as ContributionRow[]
    ).map((row) => this.toContribution(row));
  }

  /** Every contribution one meeting made, to any profile. */
  meetingContributions(meetingId: string): VoiceContribution[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM voice_profile_meetings WHERE meeting_id = ? AND embedding IS NOT NULL ORDER BY profile_id',
        )
        .all(meetingId) as unknown as ContributionRow[]
    ).map((row) => this.toContribution(row));
  }

  contribution(profileId: string, meetingId: string): VoiceContribution | null {
    const row = this.db
      .prepare(
        'SELECT * FROM voice_profile_meetings WHERE profile_id = ? AND meeting_id = ? AND embedding IS NOT NULL',
      )
      .get(profileId, meetingId);
    return row === undefined ? null : this.toContribution(row as unknown as ContributionRow);
  }

  private writeContribution(c: VoiceContribution): void {
    this.db
      .prepare(
        `INSERT INTO voice_profile_meetings (profile_id, meeting_id, embedding, sample_count, model_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (profile_id, meeting_id) DO UPDATE SET
           embedding = excluded.embedding,
           sample_count = excluded.sample_count,
           model_id = excluded.model_id`,
      )
      .run(c.profileId, c.meetingId, toBlob(c.embedding), c.sampleCount, c.modelId);
  }

  /** Adds or replaces what a meeting contributed, links it, and recomputes the profile. */
  setContribution(c: VoiceContribution): void {
    const profile = this.get(c.profileId);
    if (profile === null) throw new StorageError('PROFILE_NOT_FOUND', 'No such voice profile');
    if (profile.modelId !== c.modelId || profile.embedding.length !== c.embedding.length) {
      throw new StorageError('EMBEDDING_SIZE', 'Contribution comes from a different speaker model');
    }
    if (!Number.isInteger(c.sampleCount) || c.sampleCount < 1) {
      throw new StorageError('EMBEDDING_SIZE', 'Contribution needs a positive segment count');
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.writeContribution(c);
      this.recompute(c.profileId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Removes a meeting's row for a profile (link and contribution), recomputes what remains, and
   * deletes the profile when it has no contribution left, no link row left and was never
   * renamed on the Speakers screen. Returns true if the profile was deleted.
   */
  removeContribution(profileId: string, meetingId: string): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          'DELETE FROM voice_profile_meetings WHERE profile_id = ? AND meeting_id = ? AND embedding IS NOT NULL',
        )
        .run(profileId, meetingId);
      const gone = this.settle(profileId);
      this.db.exec('COMMIT');
      return gone;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Turns a meeting's contributions into plain links, because its voices.json is gone, and
   * recomputes. Returns the affected profile ids (a link keeps each profile alive).
   */
  dropMeetingContributions(meetingId: string): string[] {
    const ids = this.meetingContributions(meetingId).map((c) => c.profileId);
    this.db
      .prepare(
        'UPDATE voice_profile_meetings SET embedding = NULL, sample_count = NULL, model_id = NULL WHERE meeting_id = ?',
      )
      .run(meetingId);
    return ids;
  }

  /** Profile ids that currently hold a contribution from this meeting. */
  contributedProfileIds(meetingId: string): string[] {
    return this.meetingContributions(meetingId).map((c) => c.profileId);
  }

  /** Recomputes each profile that still has contributions. Never deletes a profile. */
  recomputeProfiles(ids: Iterable<string>): void {
    for (const id of new Set(ids)) {
      if (this.get(id) !== null) this.recompute(id);
    }
  }

  /** Mean of the contributions, and their summed count. No contributions: left as it is. */
  private recompute(profileId: string): void {
    const contributions = this.contributions(profileId);
    if (contributions.length === 0) return;
    const { embedding, sampleCount } = weightedMean(contributions);
    this.db
      .prepare(
        'UPDATE voice_profiles SET embedding = ?, sample_count = ?, updated_at = ? WHERE id = ?',
      )
      .run(toBlob(embedding), sampleCount, this.now(), profileId);
  }

  /** After a row went: recompute, or delete a profile with nothing left to stand on. */
  private settle(profileId: string): boolean {
    if (this.contributions(profileId).length > 0) {
      this.recompute(profileId);
      return false;
    }
    const links = this.db
      .prepare('SELECT COUNT(*) n FROM voice_profile_meetings WHERE profile_id = ?')
      .get(profileId) as { n: number };
    if (links.n > 0 || this.isKept(profileId) || this.get(profileId) === null) return false;
    this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(profileId);
    this.undoStack = [];
    this.redoStack = [];
    return true;
  }

  /** Removes the profile's voice data. `secure_delete` zeroes the pages it sat on. */
  delete(id: string): void {
    this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(id);
    this.undoStack = [];
    this.redoStack = [];
  }
}
