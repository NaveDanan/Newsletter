const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class BadRequestError extends Error {}
class ForbiddenError extends Error {}
class NotFoundError extends Error {}

// community-core.js is written for the PocketBase JSVM. Only the pure section is
// exercised here; anything touching $app, Record or $security stays untested by
// this harness and is covered by tests/scripts/community-api.mjs instead.
function loadCommunityCore() {
  const filename = path.join(__dirname, '..', 'pb_hooks', 'lib', 'community-core.js');
  const code = fs.readFileSync(filename, 'utf8');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    isFinite,
    parseInt,
    parseFloat,
    BadRequestError,
    ForbiddenError,
    NotFoundError,
  };
  vm.runInNewContext(code, sandbox, { filename });
  return sandbox.module.exports;
}

const community = loadCommunityCore();

// Values returned from the sandbox carry the vm context prototypes, which
// strict deepEqual rejects. Round-trip them into host structures first.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}


// --- Body normalization ----------------------------------------------------

assert.equal(community.trimBody('  hello  '), 'hello');
assert.equal(community.trimBody('a\r\nb'), 'a\nb');
assert.equal(community.trimBody('a\n\n\n\n\nb'), 'a\n\nb');
assert.equal(community.trimBody('a  \nb'), 'a\nb');
assert.equal(community.trimBody('x\u0000\u0007y'), 'xy');
assert.equal(community.trimBody(null), '');

assert.equal(community.truncate('abcdef', 4), 'abc…');
assert.equal(community.truncate('abc', 4), 'abc');
assert.equal(community.buildPreview('one\n\ntwo   three'), 'one two three');

// --- Handles ---------------------------------------------------------------

assert.equal(community.normalizeHandle('@AviCohen'), 'avicohen');
assert.equal(community.normalizeHandle('  @@Nave  '), 'nave');
assert.equal(community.isValidHandle('nave'), true);
assert.equal(community.isValidHandle('na'), false);
assert.equal(community.isValidHandle('123456'), false, 'numeric-only handles collide with numeric routes');
assert.equal(community.isValidHandle('nave danan'), false);
assert.equal(community.isValidHandle('n'.repeat(31)), false);
assert.equal(community.isValidHandle('a_1'), true);

assert.equal(community.suggestHandle('Nave Danan', 'nave@example.com', ''), 'nave_danan');
assert.equal(community.suggestHandle('', 'someone@example.com', ''), 'someone');
assert.equal(community.suggestHandle('נave', 'x@example.com', ''), 'ave', 'non-latin characters collapse away');
assert.equal(community.suggestHandle('שם', 'x@example.com', ''), 'member', 'an all-Hebrew name falls back to a generic base');
assert.ok(community.suggestHandle('Nave Danan', '', '7').endsWith('_7'));
assert.ok(community.suggestHandle('A very extremely long display name here', '', '').length <= 30);
assert.ok(community.isValidHandle(community.suggestHandle('שם בעברית', 'user@example.com', '')));

// --- URLs ------------------------------------------------------------------

assert.equal(community.normalizeUrl('https://Example.COM/Path'), 'https://example.com/Path');
assert.equal(community.normalizeUrl('https://example.com/'), 'https://example.com');
assert.equal(community.normalizeUrl('https://example.com:443/a'), 'https://example.com/a');
assert.equal(community.normalizeUrl('http://example.com:80'), 'http://example.com');
assert.equal(community.normalizeUrl('https://user:pass@example.com/a'), 'https://example.com/a', 'credentials are stripped');
assert.equal(community.normalizeUrl('https://example.com/a#frag'), 'https://example.com/a');
assert.equal(community.normalizeUrl('javascript:alert(1)'), '');
assert.equal(community.normalizeUrl('ftp://example.com'), '');
assert.equal(community.normalizeUrl('not a url'), '');
assert.equal(community.normalizeUrl('https://nodots/a'), '');
assert.equal(community.normalizeUrl('http://localhost:5173/x'), 'http://localhost:5173/x');

assert.equal(community.getUrlHost('https://example.com:8443/a'), 'example.com');
assert.equal(community.isPrivateHost('127.0.0.1'), true);
assert.equal(community.isPrivateHost('10.1.2.3'), true);
assert.equal(community.isPrivateHost('172.16.0.1'), true);
assert.equal(community.isPrivateHost('172.32.0.1'), false);
assert.equal(community.isPrivateHost('192.168.1.1'), true);
assert.equal(community.isPrivateHost('169.254.169.254'), true, 'cloud metadata endpoint must be blocked');
assert.equal(community.isPrivateHost('localhost'), true);
assert.equal(community.isPrivateHost('pocketbase.internal'), true);
assert.equal(community.isPrivateHost('example.com'), false);

assert.equal(community.isFetchableUrl('https://example.com/a'), true);
assert.equal(community.isFetchableUrl('http://169.254.169.254/latest/meta-data'), false);
assert.equal(community.isFetchableUrl('http://localhost:8090/api'), false);

assert.equal(community.normalizeWebsite('example.com'), 'https://example.com');
assert.equal(community.normalizeWebsite('  '), '');
assert.equal(community.normalizeWebsite('javascript:alert(1)'), '');

// --- Entities --------------------------------------------------------------

const parsed = plain(community.parseEntities('Hello @nave check #AiBreak and https://example.com/a now'));
assert.deepEqual(parsed.handles, ['nave']);
assert.deepEqual(parsed.hashtags, ['aibreak']);
assert.deepEqual(parsed.urls, ['https://example.com/a']);
assert.equal(parsed.entities.length, 3);

const ordered = parsed.entities.map((entity) => entity.type);
assert.deepEqual(ordered, ['mention', 'hashtag', 'url'], 'entities are sorted by offset');

parsed.entities.forEach((entity) => {
  const source = 'Hello @nave check #AiBreak and https://example.com/a now';
  const slice = source.slice(entity.start, entity.end);
  if (entity.type === 'mention') assert.equal(slice, '@nave');
  if (entity.type === 'hashtag') assert.equal(slice, '#AiBreak');
  if (entity.type === 'url') assert.equal(slice, 'https://example.com/a');
});

// An email address must not produce a mention, and a URL fragment must not
// produce a hashtag.
const noise = plain(community.parseEntities('write to nave@example.com about https://example.com/a#section'));
assert.deepEqual(noise.handles, []);
assert.deepEqual(noise.hashtags, []);
assert.deepEqual(noise.urls, ['https://example.com/a']);

const hebrew = plain(community.parseEntities('#בינה מלאכותית עם @nave_d'));
assert.deepEqual(hebrew.hashtags, ['בינה']);
assert.deepEqual(hebrew.handles, ['nave_d']);

const trailing = plain(community.parseEntities('see https://example.com/a.'));
assert.deepEqual(trailing.urls, ['https://example.com/a'], 'trailing punctuation is not part of the URL');

const repeated = plain(community.parseEntities('#one #one #two'));
assert.deepEqual(repeated.hashtags, ['one', 'two'], 'hashtags are deduplicated');
assert.equal(repeated.entities.length, 3, 'every occurrence still gets a render range');

const capped = plain(community.parseEntities(Array.from({ length: 25 }, (_, i) => `#tag${i}`).join(' ')));
assert.equal(capped.hashtags.length, 10, 'hashtags per post are capped');

// --- Post validation -------------------------------------------------------

assert.equal(community.validatePostInput('', 0, false).ok, false);
assert.equal(community.validatePostInput('   ', 0, false).ok, false);
assert.equal(community.validatePostInput('', 1, false).ok, true, 'media-only posts are allowed');
assert.equal(community.validatePostInput('', 0, true).ok, true, 'quote-only posts are allowed');
assert.equal(community.validatePostInput('hi', 5, false).ok, false, 'at most four attachments');
assert.equal(community.validatePostInput('x'.repeat(5001), 0, false).ok, false);
assert.equal(community.validatePostInput('x'.repeat(5000), 0, false).ok, true);
assert.equal(community.validatePostInput('  hi  ', 0, false).body, 'hi');

// --- Cursors ---------------------------------------------------------------

const cursor = community.encodeCursor('2026-09-10 08:00:00.000Z', 'abc123');
assert.equal(cursor, '2026-09-10 08:00:00.000Z|abc123');
assert.deepEqual(plain(community.decodeCursor(cursor)), { created: '2026-09-10 08:00:00.000Z', id: 'abc123' });
assert.equal(community.decodeCursor(''), null);
assert.equal(community.decodeCursor('garbage'), null);
assert.equal(community.decodeCursor('2026-09-10 08:00:00.000Z|'), null);
assert.equal(community.decodeCursor("x' || 1=1 --|abc"), null, 'a malformed cursor never reaches the filter');
assert.equal(community.encodeCursor('', 'abc'), '');

// --- Page size -------------------------------------------------------------

assert.equal(community.clampPageSize(undefined, 20, 50), 20);
assert.equal(community.clampPageSize('0', 20, 50), 20);
assert.equal(community.clampPageSize('-5', 20, 50), 20);
assert.equal(community.clampPageSize('500', 20, 50), 50);
assert.equal(community.clampPageSize('35', 20, 50), 35);

// --- Filters ---------------------------------------------------------------

const built = plain(community.buildInFilter('authorId', ['a', 'b'], 'x'));
assert.equal(built.filter, '(authorId = {:x0} || authorId = {:x1})');
assert.deepEqual(built.params, { x0: 'a', x1: 'b' });
assert.equal(community.buildInFilter('authorId', [], 'x').filter, '', 'an empty list produces no clause');

const injected = plain(community.buildInFilter('authorId', ['a" || id != "'], 'x'));
assert.equal(injected.filter, '(authorId = {:x0})');
assert.equal(injected.params.x0, 'a" || id != "', 'values travel as params, never as filter text');

// PocketBase has no NOT operator, so exclusions are a conjunction of !=.
const excluded = plain(community.buildNotInFilter('authorId', ['a', 'b'], 'blk'));
assert.equal(excluded.filter, '(authorId != {:blk0} && authorId != {:blk1})');
assert.deepEqual(excluded.params, { blk0: 'a', blk1: 'b' });
assert.equal(community.buildNotInFilter('authorId', [], 'blk').filter, '', 'an empty exclusion list produces no clause');

// A bound empty-string parameter matches no row inside the JSVM, so the empty
// side of an optional discriminator has to be written as a filter literal.
const populated = plain(community.buildEqualsFilter('postId', 'abc', 'postId'));
assert.equal(populated.filter, 'postId = {:postId}');
assert.deepEqual(populated.params, { postId: 'abc' });
const empty = plain(community.buildEqualsFilter('postId', '', 'postId'));
assert.equal(empty.filter, 'postId = ""');
assert.deepEqual(empty.params, {}, 'the empty case binds nothing');

assert.deepEqual(plain(community.uniqueStrings(['a', 'a', '', 'b', null])), ['a', 'b']);

// --- Roles -----------------------------------------------------------------

assert.equal(community.canModerate('admin'), true);
assert.equal(community.canModerate('manager'), true);
assert.equal(community.canModerate('general_manager'), true);
assert.equal(community.canModerate('author'), false);
assert.equal(community.canModerate('viewer'), false);
assert.equal(community.canModerate(''), false);

// --- Rate limit buckets ----------------------------------------------------

const windowMs = 3600000;
const t0 = 1757491200000;
assert.equal(
  community.buildBucketKey('post', 'user1', windowMs, t0),
  community.buildBucketKey('post', 'user1', windowMs, t0 + windowMs - 1),
  'the same hour shares one bucket'
);
assert.notEqual(
  community.buildBucketKey('post', 'user1', windowMs, t0),
  community.buildBucketKey('post', 'user1', windowMs, t0 + windowMs),
  'the next hour opens a new bucket'
);
assert.notEqual(
  community.buildBucketKey('post', 'user1', windowMs, t0),
  community.buildBucketKey('post', 'user2', windowMs, t0)
);
assert.notEqual(
  community.buildBucketKey('post', 'user1', windowMs, t0),
  community.buildBucketKey('like', 'user1', windowMs, t0)
);

Object.keys(community.RATE_LIMITS).forEach((action) => {
  const rule = community.RATE_LIMITS[action];
  assert.ok(rule.limit > 0 && rule.windowMs > 0, `${action} needs a positive limit and window`);
});

// --- Hash keys -------------------------------------------------------------

assert.equal(community.hashKey('https://example.com'), community.hashKey('https://example.com'));
assert.notEqual(community.hashKey('https://example.com/a'), community.hashKey('https://example.com/b'));
assert.equal(community.hashKey('https://example.com').length, 32);
assert.match(community.hashKey('https://example.com'), /^[0-9a-f]{32}$/);

// --- Constants -------------------------------------------------------------

assert.deepEqual(Array.from(community.FEED_TABS), ['for-you', 'following', 'latest']);
assert.deepEqual(Array.from(community.PROFILE_TABS), ['posts', 'replies', 'media', 'likes']);
assert.deepEqual(Array.from(community.POST_KINDS), ['post', 'reply', 'quote']);
assert.deepEqual(Array.from(community.NOTIFICATION_KINDS), ['like', 'reply', 'repost', 'quote', 'follow', 'mention']);
assert.equal(community.MAX_BODY_LENGTH, 5000);
assert.equal(community.MAX_MEDIA_PER_POST, 4);

console.log('community core checks passed');
