import { afterEach } from 'vitest';
import { forgetAllTabMemory } from './lib/tab-memory.ts';

// Tabs remember where the user left off; one test must not start where another ended.
afterEach(forgetAllTabMemory);
