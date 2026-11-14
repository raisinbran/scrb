import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBridgeBackend, type ScribeBridge } from '@scrb/contracts';
import { App } from './App.tsx';
import { BackendProvider } from './lib/backend-context.tsx';
import { MockModeProvider, detectMockMode, detectSetupBlocked } from './lib/mock-mode.tsx';
import { createHybridBackend } from './lib/hybrid-backend.ts';
import { MiniRecording } from './shell/MiniRecording.tsx';
import { DevMenu, MockBackend } from './mocks/index.ts';
import { ThemeProvider } from './theme/ThemeProvider.tsx';
import './theme/tokens.css';

declare global {
  interface Window {
    scribeBridge?: ScribeBridge;
  }
}

// In Electron, settings are real and everything else stays on the mock until its phase connects
// it. In a plain browser there is no bridge, so everything is the mock.
const bridge = window.scribeBridge;
const mock = new MockBackend();
const realBackend = bridge ? createBridgeBackend(bridge) : null;

// The recording mini window loads this same page with #mini and shows status only.
const isMini = window.location.hash === '#mini';

document.documentElement.dataset['platform'] = bridge?.platform ?? 'browser';

async function start() {
  const blocked = realBackend ? await detectSetupBlocked(realBackend) : null;
  const backend = realBackend
    ? createHybridBackend(realBackend, mock, { setupBlocked: blocked !== null })
    : mock;
  const mockRecording = realBackend ? await detectMockMode(realBackend) : true;
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <BackendProvider backend={backend}>
        <ThemeProvider>
          <MockModeProvider mock={mockRecording} blocked={blocked}>
            {isMini ? (
              <MiniRecording />
            ) : (
              <>
                <App />
                <DevMenu backend={mock} />
              </>
            )}
          </MockModeProvider>
        </ThemeProvider>
      </BackendProvider>
    </StrictMode>,
  );
}

void start();
