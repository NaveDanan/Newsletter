import { Fragment } from 'react';
import { splitCommunityBody } from '@/lib/community-text';
import { cn } from '@/lib/utils';
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
}

const ENTITY_CLASS = 'text-[#D93A3A] hover:underline focus-visible:underline focus-visible:outline-none';

export function CommunityBody({
  body,
  entities,
  onHashtagClick,
  onMentionClick,
  className,
}: CommunityBodyProps) {
  const segments = splitCommunityBody(body, entities);

  if (segments.length === 0) {
    return null;
  }

  return (
    <p className={cn('whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[#171717]', className)}>
      {segments.map((segment) => {
        const entity = segment.entity;

        if (!entity) {
          return <Fragment key={segment.key}>{segment.text}</Fragment>;
        }

        if (entity.type === 'url') {
          // The URL is rendered as an anchor because it is the one entity whose
          // destination is the text itself, and it carries the usual
          // cross-origin guards.
          return (
            <a
              key={segment.key}
              href={entity.value}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className={ENTITY_CLASS}
              onClick={(event) => event.stopPropagation()}
            >
              {segment.text}
            </a>
          );
        }

        const handleClick = entity.type === 'hashtag' ? onHashtagClick : onMentionClick;

        return (
          <button
            key={segment.key}
            type="button"
            className={ENTITY_CLASS}
            onClick={(event) => {
              event.stopPropagation();
              handleClick?.(entity.value);
            }}
          >
            {segment.text}
          </button>
        );
      })}
    </p>
  );
}
