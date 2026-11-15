// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { cancelModelDownloadersOnClose } from './model-download.ts';

describe('backend model-download shutdown', () => {
  it('cancels the summary download alongside the required-model download', () => {
    const modelDownloader = { cancel: vi.fn() };
    const summaryModelDownloader = { cancel: vi.fn() };

    cancelModelDownloadersOnClose(modelDownloader, summaryModelDownloader);

    expect(modelDownloader.cancel).toHaveBeenCalledOnce();
    expect(summaryModelDownloader.cancel).toHaveBeenCalledOnce();
  });
});
