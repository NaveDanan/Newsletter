import { getPocketBase } from './client';
import { readScope } from './read-cache';

export type ApiTokenAccess = 'read' | 'write';
export type ApiTokenScope = 'site' | 'gantt';
export interface ApiAccessToken {
  id: string;
  name: string;
  prefix: string;
  access: ApiTokenAccess;
  scope: ApiTokenScope;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  expired: boolean;
}
export interface CreateApiAccessToken {
  name: string;
  scope: ApiTokenScope;
  access: ApiTokenAccess;
  expiresInDays: number;
}

async function scopedRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const scope = readScope();
  const result = await getPocketBase().send<T>(path, { method, body, requestKey: null });
  if (scope !== readScope()) throw new Error('The signed-in account changed.');
  return result;
}

export async function fetchApiAccessTokens(): Promise<ApiAccessToken[]> {
  return (await scopedRequest<{ items: ApiAccessToken[] }>('/api/access-tokens', 'GET')).items;
}
export function createApiAccessToken(body: CreateApiAccessToken): Promise<{ token: string; item: ApiAccessToken }> {
  return scopedRequest('/api/access-tokens', 'POST', body);
}
export function revokeApiAccessToken(id: string): Promise<void> {
  return scopedRequest('/api/access-tokens/' + encodeURIComponent(id), 'DELETE');
}
