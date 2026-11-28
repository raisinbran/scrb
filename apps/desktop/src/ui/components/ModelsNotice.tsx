import { formatFileSize } from '../lib/format.ts';
import { useModelsNeeded, useOpenModels } from '../lib/models-missing.tsx';
import { AlertStrip } from './Notices.tsx';

/**
 * Shown on a fresh install until the speech models are downloaded. It does not block the app:
 * the owner can still browse, and the action goes to the download. It ends when the models arrive.
 */
export function ModelsNotice() {
  const { missing, bytes } = useModelsNeeded();
  const openModels = useOpenModels();
  if (!missing) return null;
  return (
    <AlertStrip
      role="status"
      label="Models needed"
      action={{ label: 'Download models', onClick: openModels }}
    >
      Scribe needs to download its speech models ({formatFileSize(bytes)}) before it can record.
    </AlertStrip>
  );
}
