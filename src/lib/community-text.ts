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
const SENTENCE_PUNCTUATION = '.,;:!?';

export type CommunityBodyMark = 'bold' | 'italic' | 'underline' | 'strike';

export interface CommunityBodySegment {
  key: string;
  text: string;
  entity: CommunityEntity | null;
  marks: CommunityBodyMark[];
}

interface FormattingToken {
  start: number;
  width: number;
  mark: CommunityBodyMark;
  explicit: boolean;
}

interface FormattingProjection {
  text: string;
  offsets: number[];
  marks: CommunityBodyMark[][];
}

// Mirror of projectFormatting in community-core.js. Entities are scanned on
// visible text, then mapped back to the unchanged stored body. A delimiter
// may sit inside a URL or span several entities; it is removed only after its
// matching delimiter is found. Bare URL asterisks remain literal.
function projectFormatting(body: string): FormattingProjection {
  const urlRanges: Array<{ start: number; end: number }> = [];
  const urlPattern = new RegExp(URL_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(body)) !== null) {
    urlRanges.push({ start: match.index, end: match.index + match[0].length });
  }

  const open: Partial<Record<CommunityBodyMark, FormattingToken>> = {};
  const removed = new Set<number>();
  const starts: Record<number, CommunityBodyMark[]> = {};
  const ends: Record<number, CommunityBodyMark[]> = {};
  let index = 0;
  let urlIndex = 0;

  while (index < body.length) {
    while (urlRanges[urlIndex] && index >= urlRanges[urlIndex].end) {
      urlIndex += 1;
    }
    if (body[index] === '\n' && !open.italic?.explicit) {
      delete open.italic;
    }

    if (body[index] === '\\' && '\\*+~<>'.includes(body[index + 1] ?? '\0')) {
      removed.add(index);
      index += 2;
      continue;
    }

    // New rich-editor output explicitly prefixes a formatting opener inside
    // a URL with \!. This distinguishes styling from legacy literal /a*b*.
    const explicit = body.slice(index, index + 2) === '\\!';
    const tokenStart = index + (explicit ? 2 : 0);
    const pair = body.slice(tokenStart, tokenStart + 2);
    let mark: CommunityBodyMark | null = null;
    let width = 2;
    if (body.slice(tokenStart, tokenStart + 3) === '***' && !open.bold && !open.italic) {
      mark = 'italic';
      width = 1;
    } else if (pair === '**') {
      mark = 'bold';
    } else if (pair === '~~') {
      mark = 'strike';
    } else if (pair === '++') {
      mark = 'underline';
    } else if (body[tokenStart] === '*') {
      mark = 'italic';
      width = 1;
    }

    if (!mark) {
      index += 1;
      continue;
    }

    if (explicit) width += 2;

    const opener = open[mark];
    if (opener) {
      if (index > opener.start + opener.width) {
        for (let offset = 0; offset < opener.width; offset += 1) removed.add(opener.start + offset);
        for (let offset = 0; offset < width; offset += 1) removed.add(index + offset);
        (starts[opener.start + opener.width] ??= []).push(mark);
        (ends[index] ??= []).push(mark);
      }
      delete open[mark];
    } else {
      const insideUrl = urlRanges[urlIndex] && index >= urlRanges[urlIndex].start;
      // A pair wholly within an otherwise unformatted URL can be a valid path
      // such as /a*b*. Formatting already opened outside that URL is explicit.
      if (explicit || !insideUrl || Object.keys(open).length > 0) {
        open[mark] = { start: index, width, mark, explicit };
      }
    }
    index += width;
  }

  const characters: string[] = [];
  const offsets: number[] = [];
  const marks: CommunityBodyMark[][] = [];
  let active: CommunityBodyMark[] = [];
  for (index = 0; index < body.length; index += 1) {
    if (ends[index]) active = active.filter((mark) => !ends[index].includes(mark));
    if (starts[index]) active.push(...starts[index]);
    if (!removed.has(index)) {
      characters.push(body[index]);
      offsets.push(index);
      marks.push([...active]);
    }
  }
  return { text: characters.join(''), offsets, marks };
}

function countCharacter(value: string, character: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charAt(index) === character) {
      total += 1;
    }
  }
  return total;
}

// Sentence punctuation is never part of a URL, but a closing bracket is when
// the URL itself opened it: `/wiki/Foo_(bar)` keeps its parenthesis while
// `(https://example.com/a)` does not.
function trimTrailingPunctuation(value: string): string {
  let result = value;

  while (result.length > 0) {
    const last = result.charAt(result.length - 1);
    if (SENTENCE_PUNCTUATION.indexOf(last) !== -1) {
      result = result.slice(0, -1);
      continue;
    }
    if (last === ')' && countCharacter(result, ')') > countCharacter(result, '(')) {
      result = result.slice(0, -1);
      continue;
    }
    if (last === ']' && countCharacter(result, ']') > countCharacter(result, '[')) {
      result = result.slice(0, -1);
      continue;
    }
    break;
  }

  return result;
}

// normalizeHashtag in pb_hooks/lib/community-core.js, character for
// character: no trim, because a tag never contains whitespace, and the same
// 80-character cap the hashtag column has.
export function normalizeCommunityHashtag(value: string): string {
  return (typeof value === 'string' ? value : '').replace(/^#+/, '').toLowerCase().slice(0, 80);
}

export function escapeCommunityBodyLiteral(value: string): string {
  return value.replace(/[\\*+~<>]/g, '\\$&');
}

export function visibleCommunityBody(value: string): string {
  return projectFormatting(value).text;
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
  const projection = projectFormatting(typeof body === 'string' ? body : '');
  const text = projection.text;
  const entities: CommunityEntity[] = [];
  let match: RegExpExecArray | null;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const raw = trimTrailingPunctuation(match[0]);
    // The entity carries the normalized URL and displays the raw text, which
    // is what the hook stores; a URL normalizeCommunityUrl refuses is no
    // entity at all, so the highlighting matches what the post will hold.
    const normalized = normalizeCommunityUrl(raw);
    if (normalized) {
      pushEntity(entities, {
        type: 'url',
        start: projection.offsets[match.index],
        end: projection.offsets[match.index + raw.length - 1] + 1,
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
        start: projection.offsets[start],
        end: projection.offsets[start + match[2].length] + 1,
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
        start: projection.offsets[start],
        end: projection.offsets[start + match[2].length] + 1,
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

export function splitCommunityBody(body: string, entities: CommunityEntity[]): CommunityBodySegment[] {
  const text = typeof body === 'string' ? body : '';
  if (!text) {
    return [];
  }

  const ranges = [...entities]
    .filter((entity) => entity.start >= 0 && entity.end <= text.length && entity.end > entity.start)
    .sort((a, b) => a.start - b.start)
    .map((entity) => ({ ...entity }));

  const segments: CommunityBodySegment[] = [];
  const projection = projectFormatting(text);
  const urlText = new Map<CommunityEntity, string>();
  let rangeIndex = 0;
  for (let index = 0; index < projection.text.length; index += 1) {
    const offset = projection.offsets[index];
    while (ranges[rangeIndex] && offset >= ranges[rangeIndex].end) rangeIndex += 1;
    const range = ranges[rangeIndex];
    const entity = range && offset >= range.start ? range : null;
    if (entity?.type === 'url') urlText.set(entity, (urlText.get(entity) ?? '') + projection.text[index]);
    const marks = projection.marks[index];
    const previous = segments[segments.length - 1];
    if (previous && previous.entity === entity && previous.marks.join('|') === marks.join('|')) {
      previous.text += projection.text[index];
    } else {
      segments.push({ key: `s${offset}`, text: projection.text[index], entity, marks });
    }
  }

  // Older records can contain the former scanner's marker-corrupted href.
  // Reconstruct it from visible source text without mutating stored entities.
  for (const [entity, display] of urlText) {
    entity.value = normalizeCommunityUrl(trimTrailingPunctuation(display));
    entity.display = display;
    if (!entity.value) {
      for (const segment of segments) if (segment.entity === entity) segment.entity = null;
    }
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
