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

interface ProfileChange {
  kind: 'rename' | 'merge';
  ids: string[];
  before: VoiceProfile[];
  after: VoiceProfile[];
}

interface ProfileRow {
  id: string;
  name: string | null;
  model_id: string;
  embedding: Uint8Array;
  sample_count: number;
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

  private snapshot(ids: string[]): VoiceProfile[] {
    return ids.flatMap((id) => this.get(id) ?? []);
  }

  private same(a: VoiceProfile[], b: VoiceProfile[]): boolean {
    const normalize = (items: VoiceProfile[]) =>
      items
        .map((profile) => ({
          ...profile,
          embedding: Array.from(profile.embedding),
          meetingIds: [...profile.meetingIds].sort(),
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
    return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  }

  private remember(change: ProfileChange): void {
    this.undoStack.push(change);
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
  }

  private restore(change: ProfileChange, profiles: VoiceProfile[]): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of change.ids) {
        this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(id);
      }
      for (const profile of profiles) {
        this.db
          .prepare(
            'INSERT INTO voice_profiles (id, name, model_id, embedding, sample_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            profile.id,
            profile.name,
            profile.modelId,
            toBlob(profile.embedding),
            profile.sampleCount,
            profile.createdAt,
            profile.updatedAt,
          );
        for (const meetingId of profile.meetingIds) this.link(profile.id, meetingId);
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
      .prepare('UPDATE voice_profiles SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, this.now(), id);
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
      this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(fromId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.remember({ kind: 'merge', ids, before, after: this.snapshot(ids) });
  }

  /** Removes the profile's voice data. `secure_delete` zeroes the pages it sat on. */
  delete(id: string): void {
    this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(id);
    this.undoStack = [];
    this.redoStack = [];
  }
}
