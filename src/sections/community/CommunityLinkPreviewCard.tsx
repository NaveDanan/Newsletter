import { resolveCommunityFileUrl } from '@/lib/pocketbase/community';
import type { CommunityLinkPreview } from '@/types/community';

interface CommunityLinkPreviewCardProps {
  preview: CommunityLinkPreview;
  onRemove?: () => void;
  removeLabel?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www[.]/, '');
  } catch {
    return url;
  }
}

// The preview is fetched and cached server-side by handleLinkPreview, which
// answers with an empty preview rather than an error when the target is
// unreachable, so this card only ever renders what the server managed to read.
export function CommunityLinkPreviewCard({ preview, onRemove, removeLabel }: CommunityLinkPreviewCardProps) {
  if (!preview.url) {
    return null;
  }

  const image = resolveCommunityFileUrl(preview.imageUrl);

  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-[#E5E5E5]">
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="block transition-colors hover:bg-[#FAFAFA]"
        onClick={(event) => event.stopPropagation()}
      >
        {image ? (
          <img src={image} alt="" className="h-44 w-full object-cover" loading="lazy" />
        ) : null}
        <div className="space-y-1 px-4 py-3">
          <p className="text-xs text-[#737373]">{preview.siteName || hostOf(preview.url)}</p>
          {preview.title ? (
            <p className="line-clamp-2 text-sm font-semibold text-[#171717]">{preview.title}</p>
          ) : null}
          {preview.description ? (
            <p className="line-clamp-2 text-sm text-[#737373]">{preview.description}</p>
          ) : null}
        </div>
      </a>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          className="absolute end-2 top-2 rounded-full bg-[#171717]/70 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#171717]"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
