/// Worker entry (built to `dist/source.worker.js`, import path `pulsar-ass-renderer/worker`). Serves a SubtitleSource off the main thread.
import { attachSourceHost, type HostScope } from './workerHost';

attachSourceHost(self as unknown as HostScope);
