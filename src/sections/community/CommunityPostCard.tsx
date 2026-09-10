import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete01Icon, Flag01Icon, MoreHorizontalIcon, Shield01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/contexts/LocaleContext';
import { getPocketBaseErrorMessage, moderateCommunityPost } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { CommunityAvatar } from './CommunityAvatar';
import { CommunityBody } from './CommunityBody';
import { useCommunity } from './CommunityContext';
import { CommunityLinkPreviewCard } from './CommunityLinkPreviewCard';
import { CommunityMediaGrid } from './CommunityMediaGrid';
import { CommunityPostActions } from './CommunityPostActions';
import { CommunityQuotedPost } from './CommunityQuotedPost';
import type { UseCommunityEngagementResult } from '@/hooks/useCommunityEngagement';
import type { CommunityPost } from '@/types/community';

interface CommunityPostCardProps {
  post: CommunityPost;
  actions: UseCommunityEngagementResult;
  /** Detail view renders the post larger and without the click-through. */
  variant?: 'feed' | 'detail';
  /** Draws the vertical line that ties a reply to the post above it. */
  showThreadLine?: boolean;
  onModerated?: (postId: string, status: CommunityPost['status']) => void;
}

export function CommunityPostCard({
  post,
  actions,
  variant = 'feed',
  showThreadLine = false,
  onModerated,
}: CommunityPostCardProps) {
  const { formatDate, formatRelativeTime, t } = useLocale();
  const { openPost, openProfile, openHashtag, openReport, canModerate } = useCommunity();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDetail = variant === 'detail';

  if (post.status !== 'published' || !post.author) {
    return (
      <article className="border-b border-[#E5E5E5] px-4 py-4 text-sm text-[#737373]">
        {post.status === 'removed' ? t('community.post.removed') : t('community.post.unavailable')}
      </article>
    );
  }

  const author = post.author;

  const moderate = async (restore: boolean) => {
    try {
      const result = await moderateCommunityPost(post.id, { restore });
      onModerated?.(post.id, result.status);
      toast.success(t('community.moderation.actionDone'));
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.moderation.actionFailed')));
    }
  };

  return (
    <article
      className={cn(
        'relative border-b border-[#E5E5E5] px-4 transition-colors',
        isDetail ? 'py-4' : 'cursor-pointer py-3 hover:bg-[#FAFAFA]',
      )}
      onClick={isDetail ? undefined : () => openPost(post.id)}
    >
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <CommunityAvatar
            handle={author.handle}
            displayName={author.displayName}
            avatarUrl={author.avatarUrl}
            size={isDetail ? 'lg' : 'md'}
            onClick={() => openProfile(author.handle)}
          />
          {showThreadLine ? <span className="mt-1 w-px flex-1 bg-[#E5E5E5]" aria-hidden /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className={cn('min-w-0', isDetail ? 'flex flex-col' : 'flex flex-wrap items-center gap-x-1.5')}>
              <button
                type="button"
                className="truncate text-[15px] font-semibold text-[#171717] hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  openProfile(author.handle);
                }}
              >
                {author.displayName || author.handle}
              </button>
              <span className="truncate text-[15px] text-[#737373]">@{author.handle}</span>
              {!isDetail ? (
                <>
                  <span className="text-[15px] text-[#737373]">·</span>
                  <time
                    className="whitespace-nowrap text-[15px] text-[#737373]"
                    dateTime={post.createdAt}
                    title={formatDate(post.createdAt, { dateStyle: 'long', timeStyle: 'short' })}
                  >
                    {formatRelativeTime(post.createdAt)}
                  </time>
                </>
              ) : null}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('community.post.moreActions')}
                  className="rounded-full p-1 text-[#737373] transition-colors hover:bg-[#F5F5F5] hover:text-[#171717]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                {post.isAuthor ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <HugeiconsIcon icon={Delete01Icon} className="size-4" />
                    {t('community.post.delete')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => openReport({ postId: post.id })}>
                    <HugeiconsIcon icon={Flag01Icon} className="size-4" />
                    {t('community.post.report')}
                  </DropdownMenuItem>
                )}
                {canModerate ? (
                  <DropdownMenuItem onSelect={() => void moderate(false)}>
                    <HugeiconsIcon icon={Shield01Icon} className="size-4" />
                    {t('community.moderation.removePost')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {post.kind === 'reply' && post.parentId ? (
            <button
              type="button"
              className="mt-0.5 block text-sm text-[#737373] hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                openPost(post.parentId);
              }}
            >
              {t('community.post.showThread')}
            </button>
          ) : null}

          <div className="mt-1">
            <CommunityBody
              body={post.body}
              entities={post.entities}
              onHashtagClick={openHashtag}
              onMentionClick={openProfile}
              className={isDetail ? 'text-[17px]' : undefined}
            />
          </div>

          <CommunityMediaGrid media={post.media} sensitive={post.sensitive} />
          {post.linkPreview && post.media.length === 0 ? (
            <CommunityLinkPreviewCard preview={post.linkPreview} />
          ) : null}
          {post.quotedPost ? <CommunityQuotedPost post={post.quotedPost} /> : null}

          {isDetail ? (
            <time className="mt-3 block text-sm text-[#737373]" dateTime={post.createdAt}>
              {formatDate(post.createdAt, { dateStyle: 'long', timeStyle: 'short' })}
            </time>
          ) : null}

          <CommunityPostActions post={post} actions={actions} />
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={(event) => event.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('community.post.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('community.post.deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void actions.deletePost(post)}>
              {t('community.post.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
