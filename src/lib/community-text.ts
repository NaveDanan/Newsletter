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

export function normalizeCommunityHashtag(value: string): string {
  return value.replace(/^#+/, '').trim().toLowerCase().slice(0, 80);
}

export function normalizeCommunityHandle(value: string): string {
  return value.replace(/^@+/, '').trim().toLowerCase().slice(0, 30);
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
    if (raw) {
      pushEntity(entities, {
        type: 'url',
        start: match.index,
        end: match.index + raw.length,
        value: raw,
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
    if (handle.length >= 3) {
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

export function communityBodyLength(body: string): number {
  return Array.from(typeof body === 'string' ? body : '').length;
}
