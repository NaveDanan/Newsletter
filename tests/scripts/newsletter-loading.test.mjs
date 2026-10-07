import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

class ForbiddenError extends Error {}
class NotFoundError extends Error {}
const sandbox = { $security: { sha256: (value) => createHash('sha256').update(value).digest('hex') }, module: { exports: {} }, ForbiddenError, NotFoundError, BadRequestError: Error, $dbx: { exp: (filter) => filter } };
vm.runInNewContext(readFileSync(new URL('../../pb_hooks/lib/api-manager.js', import.meta.url), 'utf8'), sandbox);
const api = sandbox.module.exports;
const source = { id: 'article', status: 'published', created: '2026-10-01', updated: '2026-10-06 12:00:00Z', title: 'Newsletter', content: '<p>Searchable article body</p><img src="data:image/png;base64,' + 'x'.repeat(100_000) + '">', coverImage: 'data:image/png;base64,AP+A', commentItems: [{ body: 'comment' }], createdById: 'writer', tags: ['AI'] };
const record = (values) => ({ id: values.id, get: (field) => values[field], getString: (field) => String(values[field] ?? ''), publicExport: () => ({ ...values }) });
function event(query = {}, values = source, auth = null) {
  const queries = [];
  const headers = new Map();
  return { queries, headers, auth, requestInfo: () => ({ query }), request: { pathValue: () => values.id, header: { get: () => '' } }, response: { header: () => ({ set: (key, value) => headers.set(key, value) }) }, app: { countRecords: () => 123, findRecordsByFilter: (...args) => { queries.push(args); return [record(values)]; }, findRecordById: () => record(values) }, json: (status, body) => ({ status, body }), blob: (status, type, body) => ({ status, type, body }) };
}

test('summary lists exclude article bodies, embedded covers and comment payloads while preserving body search', () => {
  const e = event({ view: 'summary', page: '2', perPage: '20' });
  const result = api.handleNewsletterList(e);
  const item = result.body.items[0];
  assert.equal(item.content, undefined);
  assert.equal(item.commentItems, undefined);
  assert.equal(item.searchText, 'Searchable article body');
  assert.equal(item.excerpt, 'Searchable article body...');
  assert.match(item.coverImage, /^\/api\/newsletters\/article\/cover\?v=/);
  assert.ok(JSON.stringify(result.body).length < 2000);
  assert.equal(e.queries[0][3], 20, 'database only loads the requested page');
  assert.equal(e.queries[0][4], 20);
  assert.equal(result.body.totalItems, 123);
  assert.match(e.queries[0][1], /published/, 'anonymous visibility remains enforced');
});

test('the existing list and single-record API retain full newsletter content', () => {
  const e = event();
  assert.equal(api.handleNewsletterList(e).body.items[0].content, source.content);
  assert.equal(api.handleNewsletterGet(e).body.content, source.content);
});

test('embedded cover images are served as the original binary and enforce newsletter visibility', () => {
  const result = api.handleNewsletterCover(event());
  assert.equal(result.type, 'image/png');
  assert.deepEqual(Array.from(result.body), [0, 255, 128]);
  assert.throws(() => api.handleNewsletterCover(event({}, { ...source, status: 'draft' })), ForbiddenError);
  const writer = { id: 'writer', getString: () => 'author' };
  assert.equal(api.handleNewsletterCover(event({}, { ...source, status: 'draft' }, writer)).status, 200);
});

test('summary metadata leaves remote covers intact and derives values from the current content', () => {
  const values = { ...source, coverImage: 'https://example.com/cover.jpg', content: '<p>A &nbsp; B</p>', excerpt: 'stale', readTime: 'stale' };
  const item = api.handleNewsletterList(event({ view: 'summary' }, values)).body.items[0];
  assert.equal(item.coverImage, values.coverImage);
  assert.equal(item.excerpt, 'A B...');
  assert.equal(item.readTime, '1 min read');
  const svg = { ...values, coverImage: 'data:image/svg+xml;base64,PHN2Zz4=' };
  assert.equal(api.handleNewsletterList(event({ view: 'summary' }, svg)).body.items[0].coverImage, svg.coverImage);
});

test('database summary projection omits original bodies and covers and applies owner visibility and page ordering', () => {
  const e = event({ view: 'summary', page: '3', perPage: '10', sort: '-created,title' }, source, { id: 'writer', getString: () => 'author' });
  const calls = {};
  sandbox.Record = function () {};
  sandbox.arrayOf = () => [];
  e.app.findCollectionByNameOrId = () => ({ fields: { getByName: (name) => name !== 'unknown' } });
  e.app.countRecords = (_, filter) => { calls.count = filter; return 123; };
  e.app.recordQuery = () => {
    const query = {
      select(...fields) { calls.fields = fields; return query; },
      andWhere(filter) { calls.where = filter; return query; },
      orderBy(...fields) { calls.sort = fields; return query; },
      limit(value) { calls.limit = value; return query; },
      offset(value) { calls.offset = value; return query; },
      all(rows) { rows.push(record({ ...source, content: '', coverImage: '/api/newsletters/article/cover?v=1', searchText: 'Searchable article body' })); },
    };
    return query;
  };
  const result = api.handleNewsletterList(e);
  assert.equal(result.body.items[0].searchText, 'Searchable article body');
  assert.equal(calls.fields.includes('content'), false);
  assert.equal(calls.fields.includes('coverImage'), false, 'embedded covers are projected into URLs in SQL');
  assert.equal(calls.fields.includes('commentItems'), false);
  assert.deepEqual(calls.sort, ['created DESC', 'title ASC']);
  assert.equal(calls.limit, 10); assert.equal(calls.offset, 20);
  assert.equal(calls.where, calls.count);
  assert.match(calls.where, /status = "published"\s+OR\s+createdById = "writer"/);
  assert.throws(() => api.handleNewsletterList({ ...e, requestInfo: () => ({ query: { view: 'summary', sort: 'unknown' } }) }), /Unknown newsletter sort field/);
});

test('cover revalidation checks visibility before returning 304', () => {
  const initial = event(); api.handleNewsletterCover(initial);
  const cached = event(); cached.request.header.get = () => initial.headers.get('ETag'); cached.noContent = (status) => ({ status });
  assert.equal(api.handleNewsletterCover(cached).status, 304);
  const denied = event({}, { ...source, status: 'draft' }); denied.request.header.get = cached.request.header.get;
  assert.throws(() => api.handleNewsletterCover(denied), ForbiddenError);
});
