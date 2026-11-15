import { formatFileSize } from '../lib/format.ts';
import { useModelsNeeded, useOpenModels } from '../lib/models-missing.tsx';
import styles from './ModelsNotice.module.css';

/**
 * Shown on a fresh install until the speech models are downloaded. It does not block the app:
 * the owner can still browse, and the link goes to the download.
 */
export function ModelsNotice() {
  const { missing, bytes } = useModelsNeeded();
  const openModels = useOpenModels();
  if (!missing) return null;
  return (
    <div className={styles.notice} role="status" aria-label="Models needed">
      <span>
        Scribe needs to download its speech models ({formatFileSize(bytes)}) before it can record.
      </span>
      <button type="button" className={styles.link} onClick={openModels}>
        Download models
      </button>
    </div>
  );
}
