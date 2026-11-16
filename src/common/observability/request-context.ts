import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestId<T>(requestId: string, work: () => T): T {
  return storage.run({ requestId }, work);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
