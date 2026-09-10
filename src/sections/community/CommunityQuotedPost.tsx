import { useLocale } from '@/contexts/LocaleContext';
import { resolveCommunityFileUrl } from '@/lib/pocketbase/community';
import { CommunityAvatar } from './CommunityAvatar';
import { useCommunity } from './CommunityContext';
import type { CommunityPost } from '@/types/community';

// A quote embeds a copy of the quoted post. It renders as a compact card with
// no action bar, because the engagement buttons belong to the outer post; the
// reader taps through to the original to act on it.
export function CommunityQuotedPost({ post }: { post: CommunityPost }) {
  const { formatRelativeTime, t } = useLocale();
  const { openPost } = useCommunity();

  if (post.status !== 'published' || !post.author) {
    return (
      <div className="mt-3 rounded-2xl border border-[#E5E5E5] px-4 py-3 text-sm text-[#737373]">
        {post.status === 'removed' ? t('community.post.removed') : t('community.post.unavailable')}
      </div>
    );
  }

  const firstImage = post.media.find((item) => item.kind === 'image');

  return (
    <button
      type="button"
      className="mt-3 block w-full rounded-2xl border border-[#E5E5E5] px-4 py-3 text-start transition-colors hover:bg-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93A3A]"
      onClick={(event) => {
        event.stopPropagation();
        openPost(post.id);
      }}
    >
      <div className="flex items-center gap-2">
        <CommunityAvatar
          handle={post.author.handle}
          displayName={post.author.displayName}
          avatarUrl={post.author.avatarUrl}
          size="sm"
          className="size-6"
        />
        <span className="truncate text-sm font-semibold text-[#171717]">{post.author.displayName}</span>
        <span className="truncate text-sm text-[#737373]">@{post.author.handle}</span>
        <span className="text-sm text-[#737373]">·</span>
        <span className="whitespace-nowrap text-sm text-[#737373]">{formatRelativeTime(post.createdAt)}</span>
      </div>
      {post.body ? (
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm text-[#171717]">{post.body}</p>
      ) : null}
      {firstImage ? (
        <img
          src={resolveCommunityFileUrl(firstImage.url)}
          alt={firstImage.altText}
          loading="lazy"
          className="mt-2 h-40 w-full rounded-xl object-cover"
        />
      ) : null}
    </button>
  );
}
