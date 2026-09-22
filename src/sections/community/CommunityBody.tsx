import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { splitCommunityBody } from '@/lib/community-text';
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
}

const ENTITY_CLASS = 'text-[var(--primary-accent)] hover:underline focus-visible:underline focus-visible:outline-none';

// Bodies are plain text, so the composer's formatting markers are turned into
// elements here rather than through HTML.
const MARKUP_PATTERN = /\*\*([\s\S]+?)\*\*|~~([\s\S]+?)~~|\+\+([\s\S]+?)\+\+|\*([^*\n]+)\*/g;

function renderInlineMarkup(text: string, keyPrefix: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MARKUP_PATTERN.lastIndex = 0;
  while ((match = MARKUP_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const key = `${keyPrefix}-${match.index}`;
    if (match[1] !== undefined) {
      nodes.push(<strong key={key} className="font-bold">{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<s key={key}>{match[2]}</s>);
    } else if (match[3] !== undefined) {
      nodes.push(<u key={key}>{match[3]}</u>);
    } else {
      nodes.push(<em key={key} className="italic">{match[4]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (nodes.length === 0) {
    return text;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

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
    <p className={cn('whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[var(--text-primary)]', className)}>
      {segments.map((segment) => {
        const entity = segment.entity;

        if (!entity) {
          return <Fragment key={segment.key}>{renderInlineMarkup(segment.text, segment.key)}</Fragment>;
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

        const trigger = (
          <button
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

        if (entity.type === 'mention') {
          return (
            <CommunityMentionCard key={segment.key} handle={entity.value}>
              {trigger}
            </CommunityMentionCard>
          );
        }

        return <Fragment key={segment.key}>{trigger}</Fragment>;
      })}
    </p>
  );
}
