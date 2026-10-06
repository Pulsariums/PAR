/** Rejects like `fetch` does when `signal` was aborted (name 'AbortError'). */
export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
};

let channel: MessageChannel | null = null;
const waiting: Array<() => void> = [];

/**
 * Gives the event loop a turn (a macrotask, unlike a promise): messages such as a Worker's `cancel` get delivered, so
 * long reads can notice they are stale. Falls back to `setTimeout` where there is no MessageChannel.
 */
export const yieldNow = (): Promise<void> => {
  if (typeof MessageChannel === 'undefined') return new Promise((r) => setTimeout(r, 0));
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => waiting.shift()?.();
  }
  return new Promise((r) => { waiting.push(r); channel!.port2.postMessage(0); });
};
