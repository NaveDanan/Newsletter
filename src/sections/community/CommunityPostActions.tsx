import { HugeiconsIcon } from '@hugeicons/react';
import { Bookmark01Icon, Comment01Icon, FavouriteIcon, RepeatIcon, Share01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { communityPostPath } from '@/lib/community-routes';
import { useCommunity } from './CommunityContext';
import type { UseCommunityEngagementResult } from '@/hooks/useCommunityEngagement';
import type { CommunityPost } from '@/types/community';

interface CommunityPostActionsProps {
  post: CommunityPost;
  actions: UseCommunityEngagementResult;
}

interface ActionButtonProps {
  icon: typeof Comment01Icon;
  label: string;
  count?: number;
  active?: boolean;
  activeClass: string;
  onClick: () => void;
}

function ActionButton({ icon, label, count, active, activeClass, onClick }: ActionButtonProps) {
  const { formatNumber } = useLocale();

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] text-[#737373] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93A3A]',
        active ? activeClass : 'hover:text-[#171717]',
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <HugeiconsIcon icon={icon} className="size-[18px]" />
      {typeof count === 'number' && count > 0 ? <span>{formatNumber(count)}</span> : null}
    </button>
  );
}

// The bar under every post. Counts are hidden at zero, exactly like X, so a
// quiet feed does not read as a wall of noughts.
export function CommunityPostActions({ post, actions }: CommunityPostActionsProps) {
  const { t } = useLocale();
  const { openReply } = useCommunity();

  const copyLink = async () => {
    const url = `${window.location.origin}${communityPostPath(post.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('community.post.linkCopied'));
    } catch {
      // Clipboard access is denied in some embedded browsers; the URL is still
      // in the address bar once the post is opened, so this is not an error
      // worth interrupting the reader for.
      toast.message(url);
    }
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-2 pe-8">
      <ActionButton
        icon={Comment01Icon}
        label={t('community.post.reply')}
        count={post.replyCount}
        activeClass="text-[#1D9BF0]"
        onClick={() => openReply(post)}
      />
      <ActionButton
        icon={RepeatIcon}
        label={post.reposted ? t('community.post.undoRepost') : t('community.post.repost')}
        count={post.repostCount + post.quoteCount}
        active={post.reposted}
        activeClass="text-[#00BA7C]"
        onClick={() => void actions.toggleRepost(post)}
      />
      <ActionButton
        icon={FavouriteIcon}
        label={post.liked ? t('community.post.unlike') : t('community.post.like')}
        count={post.likeCount}
        active={post.liked}
        activeClass="text-[#D93A3A]"
        onClick={() => void actions.toggleLike(post)}
      />
      <ActionButton
        icon={Bookmark01Icon}
        label={post.bookmarked ? t('community.post.removeBookmark') : t('community.post.bookmark')}
        count={post.bookmarkCount}
        active={post.bookmarked}
        activeClass="text-[#1D9BF0]"
        onClick={() => void actions.toggleBookmark(post)}
      />
      <ActionButton
        icon={Share01Icon}
        label={t('community.post.share')}
        activeClass=""
        onClick={() => void copyLink()}
      />
    </div>
  );
}
