import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBridgeBackend, type ScribeBridge } from '@scrb/contracts';
import { App } from './App.tsx';
import { BackendProvider } from './lib/backend-context.tsx';
import { DevMenu, MockBackend } from './mocks/index.ts';
import { ThemeProvider } from './theme/ThemeProvider.tsx';
import './theme/tokens.css';

declare global {
  interface Window {
    scribeBridge?: ScribeBridge;
  }
}

// The real backend is opt-in until the app core is merged; everything else runs on the mock.
const bridge = window.scribeBridge;
const useRealBackend = import.meta.env['VITE_SCRB_BACKEND'] === 'real' && bridge !== undefined;
const mock = useRealBackend ? null : new MockBackend();
const backend = useRealBackend ? createBridgeBackend(bridge) : (mock as MockBackend);

document.documentElement.dataset['platform'] = bridge?.platform ?? 'browser';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BackendProvider backend={backend}>
      <ThemeProvider>
        <App />
        {mock && <DevMenu backend={mock} />}
      </ThemeProvider>
    </BackendProvider>
  </StrictMode>,
);
