import type { CommunityEntity } from '@/types/community';

// Client-side mirror of the entity scanner in pb_hooks/lib/community-core.js.
// The server remains the authority — it is what stores `entities` on the post —
// but the composer needs the same answers locally to highlight text and to know
// which URL to unfurl before the post exists.
//
// The character class spells out the Hebrew and Arabic blocks instead of using
// a unicode property escape, exactly like the hook does, so both sides agree on
// what counts as a word character.
const WORD_CLASS = '0-9A-Za-z_\u00C0-\u024F\u0590-\u05FF\u0600-\u06FF';
const HASHTAG_PATTERN = new RegExp('(^|[^' + WORD_CLASS + '#])#([' + WORD_CLASS + ']{1,80})', 'g');
const MENTION_PATTERN = new RegExp('(^|[^' + WORD_CLASS + '@])@([0-9A-Za-z_]{3,30})', 'g');
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']{4,2000}/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

export interface CommunityBodySegment {
  key: string;
  text: string;
  entity: CommunityEntity | null;
}

// normalizeHashtag in pb_hooks/lib/community-core.js, character for
// character: no trim, because a tag never contains whitespace, and the same
// 80-character cap the hashtag column has.
export function normalizeCommunityHashtag(value: string): string {
  return (typeof value === 'string' ? value : '').replace(/^#+/, '').toLowerCase().slice(0, 80);
}

// normalizeHandle in pb_hooks/lib/community-core.js: trim first, then strip
// the sigils, and no truncation — an overlong handle has to stay overlong so
// isValidCommunityHandle can refuse it instead of silently accepting the
// first thirty characters of something the server would reject.
export function normalizeCommunityHandle(value: string): string {
  return (typeof value === 'string' ? value : '').trim().replace(/^@+/, '').toLowerCase();
}

// Mirror of isValidHandle in pb_hooks/lib/community-core.js, including the
// rule that a purely numeric handle is refused so it can never collide with
// a future numeric route. Without it the composer would highlight @12345 as
// a mention that the stored entities do not contain.
export function isValidCommunityHandle(value: string): boolean {
  const handle = normalizeCommunityHandle(value);
  if (handle.length < 3 || handle.length > 30) {
    return false;
  }
  if (!/^[0-9A-Za-z_]+$/.test(handle)) {
    return false;
  }
  return /[A-Za-z_]/.test(handle);
}

// Line-for-line port of normalizeUrl in pb_hooks/lib/community-core.js. The
// hook only records a url entity when this returns a value, so a client that
// skipped the check would highlight a link the stored entities do not have
// and would ask for a preview of a URL the server always refuses.
export function normalizeCommunityUrl(value: string): string {
  const raw = (typeof value === 'string' ? value : '').trim();
  if (!raw) {
    return '';
  }

  const match = /^(https?):\/\/([^/?#\s]+)([^\s]*)$/i.exec(raw);
  if (!match) {
    return '';
  }

  const scheme = match[1].toLowerCase();
  let authority = match[2].toLowerCase();
  let rest = match[3] || '';

  // Credentials must never be persisted or re-fetched.
  const atIndex = authority.lastIndexOf('@');
  if (atIndex !== -1) {
    authority = authority.slice(atIndex + 1);
  }

  let host = authority;
  let port = '';
  const portIndex = authority.lastIndexOf(':');
  if (portIndex > 0 && authority.indexOf(']') === -1) {
    host = authority.slice(0, portIndex);
    port = authority.slice(portIndex);
  }

  if (!host || (host.indexOf('.') === -1 && host !== 'localhost')) {
    return '';
  }

  if (port === (scheme === 'https' ? ':443' : ':80')) {
    port = '';
  }

  const hashIndex = rest.indexOf('#');
  if (hashIndex !== -1) {
    rest = rest.slice(0, hashIndex);
  }

  if (rest === '/') {
    rest = '';
  }

  const normalized = scheme + '://' + host + port + rest;
  return normalized.length > 2000 ? '' : normalized;
}

function pushEntity(entities: CommunityEntity[], candidate: CommunityEntity): void {
  const overlaps = entities.some((entity) => candidate.start < entity.end && entity.start < candidate.end);
  if (!overlaps) {
    entities.push(candidate);
  }
}

export function parseCommunityEntities(body: string): CommunityEntity[] {
  const text = typeof body === 'string' ? body : '';
  const entities: CommunityEntity[] = [];
  let match: RegExpExecArray | null;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const raw = match[0].replace(TRAILING_PUNCTUATION, '');
    // The entity carries the normalized URL and displays the raw text, which
    // is what the hook stores; a URL normalizeCommunityUrl refuses is no
    // entity at all, so the highlighting matches what the post will hold.
    const normalized = normalizeCommunityUrl(raw);
    if (normalized) {
      pushEntity(entities, {
        type: 'url',
        start: match.index,
        end: match.index + raw.length,
        value: normalized,
        display: raw,
      });
    }
    if (URL_PATTERN.lastIndex === match.index) {
      URL_PATTERN.lastIndex += 1;
    }
  }

  HASHTAG_PATTERN.lastIndex = 0;
  while ((match = HASHTAG_PATTERN.exec(text)) !== null) {
    const start = match.index + match[1].length;
    const tag = normalizeCommunityHashtag(match[2]);
    if (tag) {
      pushEntity(entities, {
        type: 'hashtag',
        start,
        end: start + match[2].length + 1,
        value: tag,
        display: match[2],
      });
    }
    if (HASHTAG_PATTERN.lastIndex === match.index) {
      HASHTAG_PATTERN.lastIndex += 1;
    }
  }

  MENTION_PATTERN.lastIndex = 0;
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    const start = match.index + match[1].length;
    const handle = normalizeCommunityHandle(match[2]);
    if (isValidCommunityHandle(handle)) {
      pushEntity(entities, {
        type: 'mention',
        start,
        end: start + match[2].length + 1,
        value: handle,
        display: match[2],
      });
    }
    if (MENTION_PATTERN.lastIndex === match.index) {
      MENTION_PATTERN.lastIndex += 1;
    }
  }

  return entities.sort((a, b) => a.start - b.start);
}

export function firstCommunityUrl(body: string): string {
  const found = parseCommunityEntities(body).find((entity) => entity.type === 'url');
  return found ? found.value : '';
}

// Splits a body into alternating plain and entity segments. The renderer turns
// the entity segments into buttons; it never builds HTML, because
// src/lib/comment-formatting.ts bans anchors and strips attributes.
export function splitCommunityBody(body: string, entities: CommunityEntity[]): CommunityBodySegment[] {
  const text = typeof body === 'string' ? body : '';
  if (!text) {
    return [];
  }

  const ranges = [...entities]
    .filter((entity) => entity.start >= 0 && entity.end <= text.length && entity.end > entity.start)
    .sort((a, b) => a.start - b.start);

  const segments: CommunityBodySegment[] = [];
  let index = 0;

  ranges.forEach((entity, position) => {
    if (entity.start < index) {
      return;
    }
    if (entity.start > index) {
      segments.push({ key: `t${index}`, text: text.slice(index, entity.start), entity: null });
    }
    segments.push({ key: `e${position}-${entity.start}`, text: text.slice(entity.start, entity.end), entity });
    index = entity.end;
  });

  if (index < text.length) {
    segments.push({ key: `t${index}`, text: text.slice(index), entity: null });
  }

  return segments;
}

// community-core.js strips /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g. The same class
// written here trips no-control-regex, which fires on a computed pattern
// too, so the identical set is tested by code point instead: everything
// below space except tab, newline and carriage return, plus DEL.
function stripControlCharacters(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 9 || code === 10 || code === 13 || (code > 31 && code !== 127)) {
      result += value.charAt(index);
    }
  }
  return result;
}

// Mirror of trimBody in pb_hooks/lib/community-core.js. The composer counts
// characters to decide whether the post button is live, so it has to measure
// exactly what validatePostInput measures: a raw count would accept a body
// the server then rejects, and would spend the budget on trailing whitespace
// the server was going to drop. Length is in UTF-16 code units on both sides,
// because that is how Goja measures a String too.
export function normalizeCommunityBody(body: string): string {
  return stripControlCharacters(typeof body === 'string' ? body : '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}
