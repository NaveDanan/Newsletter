import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlayIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import { useLocale } from '@/contexts/LocaleContext';
import { resolveCommunityFileUrl } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import type { CommunityMedia } from '@/types/community';

interface CommunityMediaGridProps {
  media: CommunityMedia[];
  sensitive: boolean;
  onOpenImage?: (media: CommunityMedia) => void;
}

// Up to four attachments per post, laid out the way X does: one fills the card,
// two split it vertically, three put one tall tile beside two stacked ones, and
// four make a 2x2. The grid is direction-agnostic because CSS grid follows the
// document direction on its own.
function layoutClassOf(count: number): string {
  if (count <= 1) {
    return 'grid-cols-1';
  }
  if (count === 3) {
    return 'grid-cols-2 grid-rows-2';
  }
  return 'grid-cols-2';
}

function tileClassOf(count: number, index: number): string {
  if (count === 1) {
    return 'aspect-[16/9]';
  }
  if (count === 3 && index === 0) {
    return 'row-span-2 aspect-auto h-full';
  }
  return 'aspect-square';
}

export function CommunityMediaGrid({ media, sensitive, onOpenImage }: CommunityMediaGridProps) {
  const { t } = useLocale();
  const [revealed, setRevealed] = useState(false);

  if (media.length === 0) {
    return null;
  }

  const items = media.slice(0, 4);
  const isHidden = sensitive && !revealed;

  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-[#E5E5E5]">
      <div className={cn('grid gap-0.5', layoutClassOf(items.length))}>
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn('relative overflow-hidden bg-[#F5F5F5]', tileClassOf(items.length, index))}
          >
            {item.kind === 'video' ? (
              <video
                className="size-full object-cover"
                src={resolveCommunityFileUrl(item.url)}
                poster={resolveCommunityFileUrl(item.posterUrl)}
                controls
                preload="metadata"
                aria-label={item.altText || t('community.post.playVideo')}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <button
                type="button"
                className="size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D93A3A]"
                aria-label={item.altText || t('community.post.openImage')}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenImage?.(item);
                }}
              >
                <img
                  className="size-full object-cover"
                  src={resolveCommunityFileUrl(item.url)}
                  alt={item.altText}
                  loading="lazy"
                />
              </button>
            )}
            {item.kind === 'video' && item.posterUrl ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <HugeiconsIcon icon={PlayIcon} className="size-10 text-white/80 drop-shadow" />
              </span>
            ) : null}
            {item.altText ? (
              <span className="pointer-events-none absolute bottom-2 start-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                ALT
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {isHidden ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#171717]/90 px-4 text-center backdrop-blur-md">
          <HugeiconsIcon icon={ViewOffIcon} className="size-6 text-white" />
          <p className="text-sm font-semibold text-white">{t('community.post.sensitiveTitle')}</p>
          <p className="text-xs text-white/70">{t('community.post.sensitiveBody')}</p>
          <button
            type="button"
            className="mt-1 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#171717] transition-colors hover:bg-[#E5E5E5]"
            onClick={(event) => {
              event.stopPropagation();
              setRevealed(true);
            }}
          >
            {t('community.post.sensitiveReveal')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
