import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBridgeBackend, type ScribeBridge } from '@scrb/contracts';
import { App } from './App.tsx';
import { BackendProvider } from './lib/backend-context.tsx';
import { createHybridBackend } from './lib/hybrid-backend.ts';
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
const backend = bridge ? createHybridBackend(createBridgeBackend(bridge), mock) : mock;

document.documentElement.dataset['platform'] = bridge?.platform ?? 'browser';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BackendProvider backend={backend}>
      <ThemeProvider>
        <App />
        <DevMenu backend={mock} />
      </ThemeProvider>
    </BackendProvider>
  </StrictMode>,
);
