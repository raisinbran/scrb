// Feeds native-converted invented speech through the production supervisor and
// dispatcher. The local HTTP model host returns invented timed words.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import {
  LiveAudioWorker,
  PcmFrameDecoder,
  toolsIn,
} from '../../../packages/transcription/dist/index.js';

const input = process.argv[2];
const label = process.argv[3];
if (!input || !label) throw new Error('usage: node live_worker_acceptance.mjs FILE LABEL');

const frames = [];
const decoder = new PcmFrameDecoder((frame) => frames.push(frame));
decoder.write(await readFile(input));
decoder.end();

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      text: 'invented speech',
      segments: [
        {
          words: [
            { word: ' invented', start: 0.1, end: 0.25, probability: 0.99 },
            { word: ' speech', start: 0.26, end: 0.45, probability: 0.99 },
          ],
        },
      ],
    }),
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('model host did not listen');

const events = [];
let lagSerial = 0;
let lastQueued = -1;
const worker = await LiveAudioWorker.start({
  tools: toolsIn('unused'),
  models: {
    speechLive: 'unused',
    speechFinal: 'unused',
    vad: 'unused',
    segmentation: 'unused',
    embedding: 'unused',
  },
  maxQueuedFrames: 4,
  startTimeoutMs: 5000,
  requestTimeoutMs: 5000,
  onEvent: (event) => {
    events.push(event);
    if (event.type === 'lag') {
      lagSerial++;
      lastQueued = event.queuedFrames;
    }
  },
  startModels: async () => ({
    port: address.port,
    detect: async () => [{ startMs: 0, endMs: 5000 }],
    close: () => new Promise((resolve) => server.close(resolve)),
  }),
});

const waitUntil = async (ready, message) => {
  const deadline = Date.now() + 10000;
  while (!ready()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
};

let refused = 0;
for (const frame of frames) {
  const before = lagSerial;
  if (!worker.offer(frame)) refused++;
  await waitUntil(
    () => lagSerial > before && lastQueued === 0,
    'worker did not drain a native frame',
  );
}
await waitUntil(
  () => events.some((event) => event.type === 'segment'),
  'worker emitted no invented speech',
);
await worker.close();

const skipped = events.filter((event) => event.type === 'skipped');
const failed = events.filter((event) => event.type === 'failed');
const segments = events.filter((event) => event.type === 'segment');
const unexpectedGaps = skipped.filter((event) => event.gap.reason === 'gap');
const result = {
  label,
  frames: frames.length,
  pcmFrames: frames.filter((frame) => !frame.boundary).length,
  boundaries: frames.filter((frame) => frame.boundary).length,
  refused,
  segments: segments.length,
  skipped: skipped.length,
  unexpectedGaps: unexpectedGaps.length,
  failed: failed.length,
};
console.log(JSON.stringify(result));
if (refused || !segments.length || skipped.length || failed.length) process.exitCode = 1;
