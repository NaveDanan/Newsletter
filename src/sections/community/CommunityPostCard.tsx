import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete01Icon,
  Flag01Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  RepeatIcon,
  Shield01Icon,
} from '@hugeicons/core-free-icons';
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
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { getPocketBaseErrorMessage, moderateCommunityPost } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { CommunityAvatar } from './CommunityAvatar';
import { CommunityBody } from './CommunityBody';
import { CommunityComposer } from './CommunityComposer';
import { useCommunity } from './CommunityContext';
import { CommunityEditPostDialog } from './CommunityEditPostDialog';
import { CommunityLinkPreviewCard } from './CommunityLinkPreviewCard';
import { CommunityMediaGrid } from './CommunityMediaGrid';
import { CommunityPostActions } from './CommunityPostActions';
import { CommunityQuotedPost } from './CommunityQuotedPost';
import { NewsletterPollCard } from '@/components/newsletter/NewsletterPollCard';
import { NewsletterEventCard } from '@/components/newsletter/NewsletterEventCard';
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
  repostedBy?: string;
  /** Replaces the built-in inline composer, e.g. to focus a composer the screen already renders. */
  onReplyClick?: () => void;
}

export function CommunityPostCard({
  post,
  actions,
  variant = 'feed',
  showThreadLine = false,
  onModerated,
  repostedBy,
  onReplyClick,
}: CommunityPostCardProps) {
  const { formatDate, formatRelativeTime, t } = useLocale();
  const { openPost, openProfile, openHashtag, openReport, canModerate, isAuthenticated, requireAuth } = useCommunity();
  const { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const isDetail = variant === 'detail';

  if (post.status !== 'published' || !post.author) {
    return (
      <article className="border-b border-[var(--border-subtle)] px-4 py-4 text-sm text-[var(--text-muted)]">
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
        'feed-post-card relative transition-all',
        isDetail ? 'py-5' : 'cursor-pointer hover:border-[var(--border-highlight)]',
      )}
      onClick={isDetail ? undefined : () => openPost(post.id)}
    >
      {repostedBy ? (
        <div className="flex items-center gap-2 mb-1.5 ps-6 text-xs font-semibold text-[var(--text-muted)]">
          <HugeiconsIcon icon={RepeatIcon} className="size-3.5 text-[var(--primary-accent)]" />
          <span>{repostedBy}</span>
        </div>
      ) : null}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <CommunityAvatar
            handle={author.handle}
            displayName={author.displayName}
            avatarUrl={author.avatarUrl || (post.isAuthor ? user?.avatar : '') || ''}
            size={isDetail ? 'lg' : 'md'}
            onClick={() => openProfile(author.handle)}
          />
          {showThreadLine ? <span className="mt-1 w-px flex-1 bg-[var(--border-subtle)]" aria-hidden /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className={cn('min-w-0', isDetail ? 'flex flex-col' : 'flex flex-wrap items-center gap-x-1.5')}>
              <button
                type="button"
                className="truncate text-[15px] font-bold text-[var(--text-primary)] hover:text-[var(--primary-accent)] transition-colors"
                onClick={(event) => {
                  event.stopPropagation();
                  openProfile(author.handle);
                }}
              >
                {author.displayName || author.handle}
              </button>
              <span className="truncate text-xs text-[var(--text-muted)]">@{author.handle}</span>
              {!isDetail ? (
                <>
                  <span className="text-xs text-[var(--text-muted)]">·</span>
                  <time
                    className="whitespace-nowrap text-xs font-semibold text-[var(--primary-accent)]"
                    dateTime={post.createdAt}
                    title={formatDate(post.createdAt, { dateStyle: 'long', timeStyle: 'short' })}
                  >
                    {formatRelativeTime(post.createdAt)}
                  </time>
                  {post.isEdited ? (
                    <>
                      <span className="text-xs text-[var(--text-muted)]">·</span>
                      <span
                        className="inline-flex items-center rounded-full bg-[var(--bg-pill)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                        title={post.editedAt ? formatDate(post.editedAt, { dateStyle: 'long', timeStyle: 'short' }) : undefined}
                      >
                        {t('community.post.edited')}
                      </span>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('community.post.moreActions')}
                  className="rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[var(--bg-card)] border-[var(--border-subtle)]" onClick={(event) => event.stopPropagation()}>
                {post.isAuthor ? (
                  <>
                    <DropdownMenuItem onSelect={() => setIsEditing(true)}>
                      <HugeiconsIcon icon={PencilEdit01Icon} className="size-4" />
                      {t('community.post.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                      <HugeiconsIcon icon={Delete01Icon} className="size-4" />
                      {t('community.post.delete')}
                    </DropdownMenuItem>
                  </>
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
              className="mt-0.5 block text-xs text-[var(--text-secondary)] hover:text-[var(--primary-accent)]"
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

          {/* Poll Card */}
          {post.poll && post.poll.question ? (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <NewsletterPollCard
                poll={post.poll}
                newsletterId={post.id}
                currentUser={user}
                onVote={actions.votePoll ? (_, optionId) => actions.votePoll(post, optionId) : undefined}
                onRequireAuth={requireAuth}
                isInteractive={true}
              />
            </div>
          ) : null}

          {/* Scheduled Event Card */}
          {post.event && post.event.title ? (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <NewsletterEventCard
                event={post.event}
                newsletterId={post.id}
                currentUser={user}
                onRsvp={actions.rsvpEvent ? () => actions.rsvpEvent(post) : undefined}
                onRequireAuth={requireAuth}
                isInteractive={true}
              />
            </div>
          ) : null}

          {isDetail ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-[#737373]">
              <time
                dateTime={post.createdAt}
                title={formatDate(post.createdAt, { dateStyle: 'long', timeStyle: 'short' })}
              >
                {formatDate(post.createdAt, { dateStyle: 'long', timeStyle: 'short' })}
              </time>
              {post.isEdited ? (
                <>
                  <span>·</span>
                  <span
                    className="inline-flex items-center rounded bg-[#F5F5F5] px-1.5 py-0.5 text-[11px] font-medium text-[#737373] ring-1 ring-inset ring-[#E5E5E5]"
                    title={post.editedAt ? formatDate(post.editedAt, { dateStyle: 'long', timeStyle: 'short' }) : undefined}
                  >
                    {t('community.post.edited')}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}

          <CommunityPostActions
            post={post}
            actions={actions}
            onReply={onReplyClick ?? (isDetail ? undefined : () => {
              if (!isAuthenticated) {
                requireAuth();
                return;
              }
              setIsReplying((open) => !open);
            })}
          />

          {isReplying && !isDetail && !onReplyClick ? (
            <div
              className="composer-slide-open mt-2 overflow-hidden rounded-[var(--radius-card)] bg-[var(--bg-card-alt)]"
              onClick={(event) => event.stopPropagation()}
            >
              <CommunityComposer
                autoFocus
                compact
                parent={post}
                onPosted={() => setIsReplying(false)}
                onCancel={() => setIsReplying(false)}
              />
            </div>
          ) : null}
        </div>
      </div>

      <CommunityEditPostDialog
        open={isEditing}
        post={post}
        onSave={(patch) => actions.editPost(post, patch)}
        onClose={() => setIsEditing(false)}
      />

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
