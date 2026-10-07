// Finds a Playwright in the usual sandbox places (NODE_PATH-free): PW_DIR, /opt/node-tools, /opt/node22.
import { createRequire } from 'node:module';
const dirs = [process.env.PW_DIR, '/opt/node-tools/', '/opt/node22/lib/node_modules/'].filter(Boolean);
let chromium;
for (const d of dirs) for (const n of ['playwright-core', 'playwright']) { try { ({ chromium } = createRequire(d)(n)); break; } catch { /* next */ } if (chromium) break; }
if (!chromium) throw new Error('playwright not found; set PW_DIR to a directory whose node_modules has playwright-core');
export { chromium };
