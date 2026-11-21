import type { AppInfo, ModelInfo, ModelRole } from '@scrb/contracts';

const ROLES: ModelRole[] = ['liveSpeech', 'finalSpeech', 'speaker', 'summary'];

/** About reports only verified files; group roles because the existing UI keys by role. */
export function appInfo(name: string, version: string, rows: readonly ModelInfo[]): AppInfo {
  return {
    name,
    version,
    buildDate: 'Not recorded',
    copyright: '© 2026 BJC, all rights reserved; personal use only',
    storageStatement: 'Recordings, transcripts and voice profiles stay on this computer.',
    models: ROLES.flatMap((role) => {
      const installed = rows.filter((row) => row.role === role && row.installed);
      return installed.length === 0
        ? []
        : [
            {
              role,
              name: installed.map((row) => row.name).join(' + '),
              version: installed.map((row) => row.version).join(' + '),
              installed: true,
              sizeBytes: installed.reduce((sum, row) => sum + row.sizeBytes, 0),
            },
          ];
    }),
  };
}

/** The production handler reads current verified disk evidence on every About request. */
export function createAppInfoHandler(sources: {
  getName(): string;
  getVersion(): string;
  readVerifiedModels(): Promise<ModelInfo[]>;
}): () => Promise<AppInfo> {
  return async () =>
    appInfo(sources.getName(), sources.getVersion(), await sources.readVerifiedModels());
}
