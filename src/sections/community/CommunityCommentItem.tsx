import { useState, useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  Delete01Icon,
  Flag01Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Shield01Icon,
  ThumbsUpIcon,
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
import { NewsletterPollCard } from '@/components/newsletter/NewsletterPollCard';
import { NewsletterEventCard } from '@/components/newsletter/NewsletterEventCard';
import { createCommunityPost, getPocketBaseErrorMessage, moderateCommunityPost } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { CommunityAvatar } from './CommunityAvatar';
import { CommunityBody } from './CommunityBody';
import { useCommunity } from './CommunityContext';
import { lazyComponent } from '@/lib/lazy-component';
import { CommunityMediaGrid } from './CommunityMediaGrid';
import { CommunityLinkPreviewCard } from './CommunityLinkPreviewCard';
import { CommunityQuotedPost } from './CommunityQuotedPost';
import { CommunityReplyInput } from './CommunityReplyInput';
import { formatCompactTime, type CommentTreeNode } from '@/lib/community-comments';
import { visibleCommunityBody } from '@/lib/community-text';
import type { UseCommunityEngagementResult } from '@/hooks/useCommunityEngagement';
import type { CommunityPost } from '@/types/community';

const CommunityEditPostDialog = lazyComponent(() => import('./CommunityEditPostDialog').then((module) => ({ default: module.CommunityEditPostDialog })));

interface CommunityCommentItemProps {
  node: CommentTreeNode;
  postAuthorId?: string;
  actions: UseCommunityEngagementResult;
  onModerated?: (postId: string, status: CommunityPost['status']) => void;
  onReplyAdded: (reply: CommunityPost) => void;
  depth?: number;
  /** Replies to a nested comment attach here so indentation stops at one level. */
  replyTargetId?: string;
}

export function CommunityCommentItem({
  node,
  postAuthorId,
  actions,
  onModerated,
  onReplyAdded,
  depth = 0,
  replyTargetId,
}: CommunityCommentItemProps) {
  const { isRTL, t, formatDate } = useLocale();
  const { openProfile, openHashtag, openReport, canModerate, isAuthenticated, requireAuth } =
    useCommunity();
  const { user } = useAuth();

  const [isReplying, setIsReplying] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [areRepliesOpen, setAreRepliesOpen] = useState(false);

  const comment = node.comment;
  const author = comment.author;

  const isPostAuthor = Boolean(author && postAuthorId && author.userId === postAuthorId);
  const hasChildren = node.children.length > 0;
  const isNested = depth > 0;

  // Text truncation for long comments (like "... See more" in reference image)
  const visibleLength = useMemo(() => visibleCommunityBody(comment.body).length, [comment.body]);
  const isLong = visibleLength > 220;

  // Nested children with connecting branch lines.
  const renderReplies = (childReplyTargetId: string | undefined) => {
    if (!hasChildren) {
      return null;
    }

    if (!areRepliesOpen) {
      return (
        <button
          type="button"
          onClick={() => setAreRepliesOpen(true)}
          aria-expanded={false}
          className="relative mt-2 inline-flex items-center gap-1.5 ps-7 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--primary-accent)] sm:ps-8"
        >
          <span
            className="absolute start-0 top-0 h-[10px] w-5 rounded-bl-[10px] border-b-2 border-s-2 border-[var(--text-muted)]/30 rtl:rounded-bl-none rtl:rounded-br-[10px] sm:w-6"
            aria-hidden="true"
          />
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
          {node.children.length === 1
            ? t('community.comments.viewReply')
            : t('community.comments.viewReplies', { count: node.children.length })}
        </button>
      );
    }

    return (
      <div className="relative mt-2 space-y-3 ps-7 sm:ps-8">
        {node.children.map((child, index) => {
          const isLast = index === node.children.length - 1;
          return (
            <div key={child.comment.id} className="relative">
              {/* Elbow: drops from the parent bubble, then curves into the child avatar. */}
              <span
                className="absolute start-0 top-0 h-[18px] w-5 sm:w-6 rounded-bl-[12px] border-b-2 border-s-2 border-[var(--text-muted)]/30 rtl:rounded-bl-none rtl:rounded-br-[12px]"
                aria-hidden="true"
              />

              {/* Trunk continuing down to the next sibling, bridging the row gap. */}
              {!isLast ? (
                <span
                  className="absolute start-0 top-[18px] -bottom-3 w-[2px] bg-[var(--text-muted)]/30"
                  aria-hidden="true"
                />
              ) : null}

              <CommunityCommentItem
                node={child}
                postAuthorId={postAuthorId}
                actions={actions}
                onModerated={onModerated}
                onReplyAdded={onReplyAdded}
                depth={depth + 1}
                replyTargetId={childReplyTargetId}
              />
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setAreRepliesOpen(false)}
          aria-expanded
          className="text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {t('community.comments.hideReplies')}
        </button>
      </div>
    );
  };

  if (comment.status !== 'published' || !author) {
    // Tombstones keep their place so published replies beneath them stay
    // visible. The server rejects replies to an unpublished parent, so those
    // children take replies themselves instead of attaching here.
    return (
      <div className="relative">
        <div className="py-2 text-xs italic text-[var(--text-muted)] ps-10">
          {comment.status === 'removed' ? t('community.post.removed') : t('community.post.unavailable')}
        </div>
        {renderReplies(undefined)}
      </div>
    );
  }

  const handleToggleLike = () => {
    if (!isAuthenticated) {
      requireAuth();
      return;
    }
    void actions.toggleLike(comment);
  };

  const handleOpenReply = () => {
    if (!isAuthenticated) {
      requireAuth();
      return;
    }
    setIsReplying((current) => !current);
  };

  const handleModerate = async (restore: boolean) => {
    try {
      const result = await moderateCommunityPost(comment.id, { restore });
      onModerated?.(comment.id, result.status);
      toast.success(t('community.moderation.actionDone'));
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.moderation.actionFailed')));
    }
  };

  const handleSubmitReply = async (body: string) => {
    if (isSubmittingReply) {
      return;
    }

    if (!isAuthenticated) {
      requireAuth();
      return;
    }

    setIsSubmittingReply(true);
    try {
      const created = await createCommunityPost({
        body,
        parentId: replyTargetId ?? comment.id,
      });
      setIsReplying(false);
      setAreRepliesOpen(true);
      onReplyAdded(created);
      toast.success(t('community.composer.replied'));
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.composer.postFailed')));
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-start gap-2.5 sm:gap-3">
        {/* Author Avatar */}
        <div className="relative shrink-0 z-10">
          <CommunityAvatar
            handle={author.handle}
            displayName={author.displayName}
            avatarUrl={author.avatarUrl || (comment.isAuthor ? user?.avatar : '') || ''}
            size={isNested ? 'sm' : 'md'}
            onClick={() => openProfile(author.handle)}
            className="ring-2 ring-[var(--bg-app)]"
          />
        </div>

        {/* Comment Content Area */}
        <div className="min-w-0 flex-1">
          {/* Bubble container */}
          <div className="inline-block relative max-w-full group/bubble">
            <div className="rounded-[18px] bg-[var(--bg-card-alt)] hover:bg-[var(--bg-pill)]/70 transition-colors border border-[var(--border-subtle)]/60 px-3.5 py-2 sm:px-4 sm:py-2.5 text-start shadow-2xs">
              {/* Header: Author Name & Badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => openProfile(author.handle)}
                  className="font-bold text-[13px] sm:text-[14px] text-[var(--text-primary)] hover:underline transition-colors leading-tight"
                >
                  {author.displayName || author.handle}
                </button>

                {isPostAuthor ? (
                  <span className="rounded-full bg-[var(--primary-accent)]/15 px-1.5 py-0.2 text-[10px] font-semibold text-[var(--primary-accent)] leading-tight">
                    {t('community.comments.authorBadge')}
                  </span>
                ) : null}

                <span className="text-[11px] text-[var(--text-muted)]">@{author.handle}</span>
              </div>

              {/* Body Text */}
              <div className="mt-1 text-[14px] sm:text-[15px] leading-relaxed text-[var(--text-primary)]" dir="auto">
                <CommunityBody
                  body={comment.body}
                  entities={comment.entities}
                  maxLength={isLong && !isExpanded ? 200 : undefined}
                  onHashtagClick={openHashtag}
                  onMentionClick={openProfile}
                  className="inline"
                />

                {isLong ? (
                  <>
                    {!isExpanded ? (
                      <>
                        <span className="text-[var(--text-muted)]">... </span>
                        <button
                          type="button"
                          onClick={() => setIsExpanded(true)}
                          className="font-bold text-[var(--text-primary)] hover:underline inline-block text-xs"
                        >
                          {t('community.comments.seeMore')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsExpanded(false)}
                        className="ms-2 font-semibold text-[var(--text-muted)] hover:underline inline-block text-xs"
                      >
                        {t('community.comments.seeLess')}
                      </button>
                    )}
                  </>
                ) : null}
              </div>

              {/* Attached Media / Photos */}
              {comment.media && comment.media.length > 0 ? (
                <div className="mt-2.5 max-w-sm overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                  <CommunityMediaGrid media={comment.media} sensitive={comment.sensitive} />
                </div>
              ) : null}

              {comment.linkPreview && comment.media.length === 0 ? (
                <CommunityLinkPreviewCard preview={comment.linkPreview} />
              ) : null}
              {comment.quotedPost ? <CommunityQuotedPost post={comment.quotedPost} /> : null}

              {comment.poll?.question ? (
                <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                  <NewsletterPollCard
                    poll={comment.poll}
                    newsletterId={comment.id}
                    currentUser={isAuthenticated ? user : null}
                    onVote={(_, optionId) => actions.votePoll(comment, optionId)}
                    onRequireAuth={requireAuth}
                  />
                </div>
              ) : null}

              {comment.event?.title ? (
                <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                  <NewsletterEventCard
                    event={comment.event}
                    newsletterId={comment.id}
                    currentUser={isAuthenticated ? user : null}
                    onRsvp={() => actions.rsvpEvent(comment)}
                    onRequireAuth={requireAuth}
                  />
                </div>
              ) : null}
            </div>

            {/* Reaction badge pill on bottom corner of bubble */}
            {comment.likeCount > 0 ? (
              <button
                type="button"
                onClick={handleToggleLike}
                title={t('community.comments.likesCount', { count: comment.likeCount })}
                className={cn(
                  'absolute -bottom-2 z-10 inline-flex items-center gap-1 rounded-full bg-[var(--bg-card)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] shadow-xs border border-[var(--border-subtle)] hover:scale-105 transition-transform',
                  isRTL ? 'start-2' : 'end-2',
                )}
              >
                <span className="flex size-3.5 items-center justify-center rounded-full bg-blue-500 text-white text-[8px]">
                  <HugeiconsIcon icon={ThumbsUpIcon} className="size-2.5 fill-current" />
                </span>
                <span>{comment.likeCount}</span>
              </button>
            ) : null}
          </div>

          {/* Action Row Under Bubble */}
          <div className="mt-1 flex items-center gap-3 ps-3 text-xs font-semibold text-[var(--text-muted)]">
            {/* Timestamp */}
            <time
              dateTime={comment.createdAt}
              title={formatDate(comment.createdAt, { dateStyle: 'long', timeStyle: 'short' })}
              className="text-[var(--text-muted)] hover:underline cursor-default"
            >
              {formatCompactTime(comment.createdAt, isRTL)}
            </time>

            {/* Like button */}
            <button
              type="button"
              onClick={handleToggleLike}
              className={cn(
                'transition-colors hover:underline',
                comment.liked
                  ? 'font-bold text-[var(--primary-accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              {comment.liked ? t('community.comments.liked') : t('community.comments.like')}
            </button>

            {/* Reply button */}
            <button
              type="button"
              onClick={handleOpenReply}
              className="transition-colors hover:underline text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {t('community.comments.reply')}
            </button>

            {/* Edited label */}
            {comment.isEdited ? (
              <span className="text-[10px] text-[var(--text-muted)] opacity-80" title={comment.editedAt}>
                {t('community.post.edited')}
              </span>
            ) : null}

            {/* More menu (three dots) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('community.post.moreActions')}
                  className="rounded-full p-0.5 text-[var(--text-muted)] opacity-60 hover:opacity-100 hover:text-[var(--text-primary)] transition-opacity"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isRTL ? 'start' : 'end'}
                className="bg-[var(--bg-card)] border-[var(--border-subtle)]"
              >
                {comment.isAuthor ? (
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
                  <DropdownMenuItem onSelect={() => openReport({ postId: comment.id })}>
                    <HugeiconsIcon icon={Flag01Icon} className="size-4" />
                    {t('community.post.report')}
                  </DropdownMenuItem>
                )}
                {canModerate ? (
                  <DropdownMenuItem onSelect={() => void handleModerate(false)}>
                    <HugeiconsIcon icon={Shield01Icon} className="size-4" />
                    {t('community.moderation.removePost')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Inline Reply Composer */}
          {isReplying ? (
            <div className="relative mt-2 ps-7 sm:ps-8">
              {/* Elbow connecting the parent bubble to this composer */}
              <span
                className="absolute start-0 top-0 h-[18px] w-5 sm:w-6 rounded-bl-[12px] border-b-2 border-s-2 border-[var(--text-muted)]/30 rtl:rounded-bl-none rtl:rounded-br-[12px]"
                aria-hidden="true"
              />

              <CommunityReplyInput
                placeholder={t('community.comments.replyingTo', {
                  name: author.displayName || author.handle,
                })}
                mentionSeed={{
                  handle: author.handle,
                  displayName: author.displayName,
                  avatarUrl: author.avatarUrl,
                }}
                isSubmitting={isSubmittingReply}
                onSubmit={(body) => void handleSubmitReply(body)}
                onCancel={() => setIsReplying(false)}
              />
            </div>
          ) : null}

          {renderReplies(comment.id)}
        </div>
      </div>

      {isEditing ? <CommunityEditPostDialog
        open={isEditing}
        post={comment}
        onSave={(patch) => actions.editPost(comment, patch)}
        onClose={() => setIsEditing(false)}
      /> : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={(event) => event.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('community.post.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('community.post.deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void actions.deletePost(comment)}>
              {t('community.post.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
