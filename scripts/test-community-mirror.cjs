const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// src/lib/community-text.ts re-implements the part of
// pb_hooks/lib/community-core.js that the composer needs before a post
// exists: what counts as an entity, how a URL is normalized, which handles
// are real and how a body is trimmed before it is measured. Two
// implementations of one rule drift, and every drift is a visible bug — a
// highlight the stored entities do not have, a character counter that
// disagrees with the 400 the post route returns, a preview requested for a
// URL the server always refuses. So rather than assert fixed expectations
// twice, this harness runs both implementations over one corpus and asserts
// they answer identically.
//
// The hook is written for the PocketBase JSVM and is loaded in a node:vm
// sandbox, exactly as scripts/test-community-core.cjs loads it. The mirror is
// TypeScript that Node type-strips on require.

function loadCommunityCore() {
  const filename = path.join(__dirname, '..', 'pb_hooks', 'lib', 'community-core.js');
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
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return sandbox.module.exports;
}

const server = loadCommunityCore();
const client = require('../src/lib/community-text.ts');

// Values crossing the sandbox boundary carry its prototypes, which strict
// deepEqual rejects; comparing serialized entities sidesteps that entirely.
function serializeEntities(list) {
  return list.map((entity) => [entity.type, entity.start, entity.end, entity.value, entity.display].join('\u0000'));
}

// --- Bodies ----------------------------------------------------------------

// Each body targets a branch one side has: a bare word boundary, an email
// that must not become a mention, a fragment that must not become a hashtag,
// a numeric handle the hook refuses, a host with no dot, credentials, default
// ports, an overlong URL, RTL scripts and an already-taken offset.
const BODIES = [
  '',
  'plain text with no entities at all',
  'Hello @nave check #AiBreak and https://example.com/a now',
  'write to nave@example.com about https://example.com/a#section',
  '#\u05d1\u05d9\u05e0\u05d4 with words after @nave_d',
  '#\u0645\u0631\u062d\u0628\u0627 arabic tag',
  'see https://example.com/a.',
  'trailing paren (https://example.com/a)',
  '#one #one #two',
  'mention @12345 is numeric only',
  'mention @123_5 has an underscore',
  'mention @ab is too short, @abc is not',
  'mention @_lead starts with an underscore',
  'http://localhost:5173/x is a dev link',
  'https://nodots/a has no dot',
  'creds https://user:pass@example.com/a stripped',
  'ports https://example.com:443/a and http://example.com:80/b',
  'kept https://example.com:8443/a',
  'upper https://Example.COM/Path',
  'slash https://example.com/ ends bare',
  'frag https://example.com/a#frag is cut',
  'ftp://example.com is not http',
  'javascript:alert(1) is refused',
  'https://[::1]/a is bracketed',
  'query https://example.com/a?q=1&r=2 kept',
  'two https://a.example.com/x https://b.example.com/y',
  'long https://example.com/' + 'a'.repeat(2100),
  '@' + 'a'.repeat(40) + ' is overlong',
  '#' + 't'.repeat(90) + ' is an overlong tag',
  'mixed @NaveD #TAG https://EXAMPLE.com/A',
  'adjacent#tag and adjacent@mention are not entities',
  '@nave@example.com',
  '#tag_with_\u05e2\u05d1\u05e8\u05d9\u05ea mixed scripts',
  'x'.repeat(4990) + ' #tail',
];

BODIES.forEach((sample) => {
  const label = JSON.stringify(sample.length > 48 ? sample.slice(0, 45) + '...' : sample);
  assert.deepEqual(
    serializeEntities(client.parseCommunityEntities(sample)),
    serializeEntities(JSON.parse(JSON.stringify(server.parseEntities(sample))).entities),
    `parseCommunityEntities must match parseEntities for ${label}`,
  );

  // The composer unfurls the first URL of the body, so it has to be the same
  // first URL the hook would have recorded on the post.
  const urls = JSON.parse(JSON.stringify(server.parseEntities(sample))).entities
    .filter((entity) => entity.type === 'url');
  assert.equal(
    client.firstCommunityUrl(sample),
    urls.length ? urls[0].value : '',
    `firstCommunityUrl must be the URL the hook stores for ${label}`,
  );

  assert.equal(
    client.normalizeCommunityBody(sample),
    server.trimBody(sample),
    `normalizeCommunityBody must match trimBody for ${label}`,
  );
});

// --- Whitespace and control characters -------------------------------------

// The composer submits the body it counted, so trimBody has to leave that
// string alone: if the server trimmed it further, the stored post would
// differ from what the author was told would fit.
const WHITESPACE = [
  '',
  '   ',
  '  hello  ',
  'a\r\nb',
  'a\rb',
  'a\n\n\n\n\nb',
  'a  \nb  \n  ',
  'x\u0000\u0007\u001fy',
  'del\u007fete',
  'keep\ttab and \u000bvertical',
  '\n\n\n',
  'emoji \u{1F600}\u{1F600} tail',
  '  \u05e9\u05dc\u05d5\u05dd  ',
  'trailing\ttab\t',
  'x'.repeat(5000) + '   ',
  'x'.repeat(5000) + '  \n',
];

WHITESPACE.forEach((sample) => {
  const label = JSON.stringify(sample.length > 32 ? sample.slice(0, 29) + '...' : sample);
  const normalized = client.normalizeCommunityBody(sample);
  assert.equal(normalized, server.trimBody(sample), `normalizeCommunityBody must match trimBody for ${label}`);
  assert.equal(server.trimBody(normalized), normalized, `trimBody must leave an already-normalized body alone for ${label}`);
});

// The counter and the 400 have to agree at the boundary in both directions.
assert.equal(client.normalizeCommunityBody('x'.repeat(5000) + '  \n').length, server.MAX_BODY_LENGTH);
assert.equal(server.validatePostInput('x'.repeat(5000) + '  \n', 0, false).ok, true);
assert.equal(client.normalizeCommunityBody('x'.repeat(5001)).length, server.MAX_BODY_LENGTH + 1);
assert.equal(server.validatePostInput('x'.repeat(5001), 0, false).ok, false);
assert.equal(client.normalizeCommunityBody(null), '');

// An emoji is a surrogate pair: two units on both sides, never one.
assert.equal(client.normalizeCommunityBody('\u{1F600}').length, server.trimBody('\u{1F600}').length);
assert.equal(client.normalizeCommunityBody('\u{1F600}').length, 2);

// --- URLs ------------------------------------------------------------------

const URLS = [
  '',
  '   ',
  'not a url',
  'https://Example.COM/Path',
  'https://example.com/',
  'https://example.com',
  'https://example.com:443/a',
  'http://example.com:80',
  'https://example.com:8443/a',
  'https://user:pass@example.com/a',
  'https://user@example.com',
  'https://example.com/a#frag',
  'https://example.com/a?q=1#frag',
  'javascript:alert(1)',
  'ftp://example.com',
  'https://nodots/a',
  'http://localhost:5173/x',
  'http://localhost',
  'http://127.0.0.1/x',
  'https://[::1]:8080/a',
  'HTTPS://EXAMPLE.COM',
  'https://example.com/' + 'a'.repeat(2100),
  'https://example.com/a b',
];

URLS.forEach((sample) => {
  const label = JSON.stringify(sample.length > 40 ? sample.slice(0, 37) + '...' : sample);
  assert.equal(client.normalizeCommunityUrl(sample), server.normalizeUrl(sample), `normalizeCommunityUrl must match normalizeUrl for ${label}`);
});

// --- Handles and hashtags --------------------------------------------------

const HANDLES = [
  '', 'a', 'ab', 'abc', 'nave', '@Nave', '@@double', '  @nave  ',
  '12345', '123_5', '_lead', 'has-dash', 'has space', 'a'.repeat(30),
  'a'.repeat(31), '\u05e2\u05d1\u05e8\u05d9\u05ea', 'mixed_1', '0000000',
];

HANDLES.forEach((sample) => {
  const label = JSON.stringify(sample);
  assert.equal(client.normalizeCommunityHandle(sample), server.normalizeHandle(sample), `normalizeCommunityHandle must match normalizeHandle for ${label}`);
  assert.equal(client.isValidCommunityHandle(sample), server.isValidHandle(sample), `isValidCommunityHandle must match isValidHandle for ${label}`);
});

const HASHTAGS = ['', '#Tag', '##Tag', 'tag', '  #spaced  ', '#\u05e2\u05d1\u05e8\u05d9\u05ea', 'T'.repeat(90), '#123'];

HASHTAGS.forEach((sample) => {
  assert.equal(
    client.normalizeCommunityHashtag(sample),
    server.normalizeHashtag(sample),
    `normalizeCommunityHashtag must match normalizeHashtag for ${JSON.stringify(sample)}`,
  );
});

console.log(
  'community mirror checks passed: ' + BODIES.length + ' bodies, ' + WHITESPACE.length +
  ' whitespace cases, ' + URLS.length + ' urls, ' + HANDLES.length + ' handles and ' +
  HASHTAGS.length + ' hashtags answered identically by pb_hooks/lib/community-core.js and src/lib/community-text.ts',
);
