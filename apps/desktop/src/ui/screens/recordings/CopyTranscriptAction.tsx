import { useEffect, useState } from 'react';
import { IconButton } from '../../components/IconButton.tsx';
import { formatTranscriptForCopy } from './copy-transcript.ts';
import type { TranscriptData } from './use-transcript.ts';
import styles from './recordings.module.css';

async function writeClipboardText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // The app denies renderer clipboard permissions; try the user-gesture copy command instead.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  try {
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard copy failed.');
  } finally {
    textarea.remove();
  }
}

export function CopyTranscriptAction({
  transcript,
  onError,
}: {
  transcript: TranscriptData;
  onError?(message: string | null): void;
}) {
  const { segments, speakers, totalSegments, loading, error } = transcript;
  const [copied, setCopied] = useState(false);
  const ready = !loading && !error && segments.length === totalSegments && segments.length > 0;

  useEffect(() => setCopied(false), [segments, totalSegments]);

  const copyTranscript = async () => {
    if (!ready) return;
    setCopied(false);
    onError?.(null);
    try {
      await writeClipboardText(formatTranscriptForCopy(segments, speakers));
      setCopied(true);
    } catch {
      onError?.('The transcript could not be copied.');
    }
  };

  const tip = copied
    ? 'Transcript copied'
    : error
      ? 'Transcript unavailable'
      : loading || segments.length !== totalSegments
        ? 'Loading the full transcript'
        : segments.length === 0
          ? 'No transcript text to copy'
          : 'Copy transcript';

  return (
    <>
      <IconButton
        label="Copy transcript"
        icon="copy"
        tip={tip}
        disabled={!ready}
        onClick={() => void copyTranscript()}
      />
      <span className={styles.srOnly} role="status">
        {copied ? 'Transcript copied.' : ''}
      </span>
    </>
  );
}
