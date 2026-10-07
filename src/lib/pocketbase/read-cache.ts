import { QueryCache } from '@/lib/query-cache';
import { getPocketBase, subscribeToAuthRecord } from './client';

export const readCache = new QueryCache();

export function readScope(): string {
  const pb = getPocketBase();
  const record = pb.authStore.record;
  return `${pb.baseURL}|${pb.authStore.isValid && record ? `${record.id}:${record.role}` : 'anonymous'}|`;
}

let previousScope = readScope();
subscribeToAuthRecord(() => {
  const scope = readScope();
  if (previousScope !== scope) readCache.invalidate();
  previousScope = scope;
});

export function cachedRead<T>(path: string, load: () => Promise<T>, options?: { force?: boolean; maxAge?: number }): Promise<T> {
  return readCache.read(readScope() + path, load, options);
}

export function peekRead<T>(path: string, maxAge?: number): T | undefined {
  return readCache.peek(readScope() + path, maxAge);
}

export function invalidateReads(): void { readCache.invalidate(); }
