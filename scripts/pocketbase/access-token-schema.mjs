import { autodate, text } from './schema-fields.mjs';

// Only the authenticated token-management hooks access this collection.
export const ACCESS_TOKENS_SCHEMA = {
  name: 'access_tokens', type: 'base',
  fields: [
    autodate('created'), autodate('updated', true, true),
    text('ownerId', 15, { required: true }),
    text('name', 80, { required: true }),
    text('tokenHash', 64, { required: true, hidden: true }),
    text('prefix', 16, { required: true }),
    { name: 'access', type: 'select', required: true, maxSelect: 1, values: ['read', 'write'] },
    { name: 'scope', type: 'select', maxSelect: 1, values: ['gantt', 'site', 'authoring'] },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'lastUsedAt', type: 'date' },
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_access_tokens_hash ON access_tokens (tokenHash)',
    'CREATE INDEX idx_access_tokens_owner ON access_tokens (ownerId, created DESC)',
  ],
  listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
};
