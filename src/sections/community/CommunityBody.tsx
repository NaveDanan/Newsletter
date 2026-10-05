import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { parseCommunityEntities, splitCommunityBody } from '@/lib/community-text';
import type { CommunityBodyMark, CommunityBodySegment } from '@/lib/community-text';
import { cn } from '@/lib/utils';
import { CommunityMentionCard } from './CommunityMentionCard';
import type { CommunityEntity } from '@/types/community';

// Renders a post body as React nodes. It never builds HTML: the sanitizer in
// src/lib/comment-formatting.ts strips anchors and every attribute, so the only
// safe way to make a hashtag clickable is to emit a button for it here.

interface CommunityBodyProps {
  body: string;
  entities: CommunityEntity[];
  onHashtagClick?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
  className?: string;
  maxLength?: number;
}

const ENTITY_CLASS = 'text-[var(--primary-accent)] hover:underline focus-visible:underline focus-visible:outline-none';

// Formatting is paired before entity splitting, so it can cross text and
// interactive elements. React escapes the content instead of building HTML.
function withMarks(text: string, marks: CommunityBodyMark[], keyPrefix: string): ReactNode {
  return marks.reduceRight<ReactNode>((child, mark, position) => {
    const key = `${keyPrefix}-${mark}-${position}`;
    if (mark === 'bold') {
      return <strong key={key} className="font-bold">{child}</strong>;
    }
    if (mark === 'italic') {
      return <em key={key} className="italic">{child}</em>;
    }
    if (mark === 'underline') {
      return <u key={key}>{child}</u>;
    }
    return <s key={key}>{child}</s>;
  }, text);
}

function clipSegments(segments: CommunityBodySegment[], maxLength?: number): CommunityBodySegment[] {
  if (maxLength === undefined) return segments;
  const clipped: CommunityBodySegment[] = [];
  let remaining = Math.max(0, Math.floor(maxLength));
  for (const segment of segments) {
    if (remaining <= 0) break;
    const text = segment.text.slice(0, remaining);
    clipped.push({ ...segment, text });
    remaining -= text.length;
  }
  while (clipped.length > 0) {
    const last = clipped[clipped.length - 1];
    last.text = last.text.trimEnd();
    if (last.text) break;
    clipped.pop();
  }
  return clipped;
}

export function CommunityBody({
  body,
  entities,
  onHashtagClick,
  onMentionClick,
  className,
  maxLength,
}: CommunityBodyProps) {
  // Records written by an older scanner can contain partial handles/tags or
  // marker-corrupted URLs. Reconcile their derived ranges using today's mirror
  // so the visible text and interactive destination agree without a backfill.
  const parsed = parseCommunityEntities(body);
  const hasDrift = parsed.length !== entities.length || parsed.some((entity, index) => {
    const stored = entities[index];
    return stored.type !== entity.type || stored.start !== entity.start || stored.end !== entity.end || stored.value !== entity.value;
  });
  // Clip only the visible label after parsing the complete source, so a URL
  // cut by "See more" keeps its full destination and formatting still pairs.
  const segments = clipSegments(splitCommunityBody(body, hasDrift ? parsed : entities), maxLength);

  if (segments.length === 0) {
    return null;
  }

  const groups: Array<{ key: string; entity: CommunityEntity | null; parts: CommunityBodySegment[] }> = [];
  for (const segment of segments) {
    const previous = groups[groups.length - 1];
    if (previous && previous.entity === segment.entity) {
      previous.parts.push(segment);
    } else {
      groups.push({ key: segment.key, entity: segment.entity, parts: [segment] });
    }
  }

  return (
    <p className={cn('whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[var(--text-primary)]', className)}>
      {groups.map((group) => {
        const entity = group.entity;
        const content = group.parts.map((part) => (
          <Fragment key={part.key}>{withMarks(part.text, part.marks, part.key)}</Fragment>
        ));

        if (!entity) {
          return <Fragment key={group.key}>{content}</Fragment>;
        }

        if (entity.type === 'url') {
          // The URL is rendered as an anchor because it is the one entity whose
          // destination is the text itself, and it carries the usual
          // cross-origin guards.
          return (
            <a
              key={group.key}
              href={entity.value}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className={ENTITY_CLASS}
              onClick={(event) => event.stopPropagation()}
            >
              {content}
            </a>
          );
        }

        const handleClick = entity.type === 'hashtag' ? onHashtagClick : onMentionClick;

        const trigger = (
          <button
            type="button"
            className={ENTITY_CLASS}
            onClick={(event) => {
              event.stopPropagation();
              handleClick?.(entity.value);
            }}
          >
            {content}
          </button>
        );

        if (entity.type === 'mention') {
          return (
            <CommunityMentionCard key={group.key} handle={entity.value}>
              {trigger}
            </CommunityMentionCard>
          );
        }

        return <Fragment key={group.key}>{trigger}</Fragment>;
      })}
    </p>
  );
}
