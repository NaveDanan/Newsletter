import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Bookmark01Icon, BookmarkCheck01Icon, Heart, Link01Icon, Message01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { lazyComponent } from '@/lib/lazy-component';
import { DeferredContent } from '@/components/DeferredContent';
import { useLocale } from '@/contexts/LocaleContext';
import { NewsletterContent } from '@/components/newsletter/NewsletterContent';
import { stripCommentFormatting } from '@/lib/comment-formatting';
import { cn } from '@/lib/utils';
import { NewsletterPollCard } from '@/components/newsletter/NewsletterPollCard';
import { NewsletterEventCard } from '@/components/newsletter/NewsletterEventCard';
import type { PocketBaseUser } from '@/lib/pocketbase/client';
import type { Newsletter, NewsletterComment } from '../types/newsletter';
import '../components/editor/EditorStyles.css';

const CommentReply = lazyComponent(() => import('@/components/ui/comment-reply').then((module) => ({ default: module.CommentReply })));

interface NewsletterViewerProps {
  newsletter: Newsletter;
  onBack: () => void;
  currentUser?: PocketBaseUser | null;
  onRequireAuth?: () => void;
  onToggleLike?: (newsletterId: string) => void;
  onAddComment?: (newsletterId: string, body: string) => Promise<NewsletterComment | null> | NewsletterComment | null;
  onToggleCommentLike?: (newsletterId: string, commentId: string) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: (newsletterId: string) => void;
  onVotePoll?: (newsletterId: string, optionId: string) => void | Promise<unknown>;
  onRsvpEvent?: (newsletterId: string) => void | Promise<unknown>;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function NewsletterViewer({
  newsletter,
  onBack,
  currentUser = null,
  onRequireAuth,
  onToggleLike,
  onAddComment,
  onToggleCommentLike,
  isBookmarked = false,
  onToggleBookmark,
  onVotePoll,
  onRsvpEvent,
}: NewsletterViewerProps) {
  const { formatDate, formatNumber, formatRelativeTime, isRTL, t } = useLocale();
  const articleRef = useRef<HTMLDivElement>(null);
  const discussionRef = useRef<HTMLDivElement>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const isAuthenticated = Boolean(currentUser?.id);
  const hasLikedNewsletter = Boolean(currentUser?.id && newsletter.likedByUserIds.includes(currentUser.id));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [newsletter.id]);

  // Reset the draft when a different newsletter is shown, without an effect round-trip.
  const [draftNewsletterId, setDraftNewsletterId] = useState(newsletter.id);
  if (draftNewsletterId !== newsletter.id) {
    setDraftNewsletterId(newsletter.id);
    setCommentDraft('');
  }

  const handleShare = (platform: string) => {
    const url = window.location.href;
    const text = t('viewer.shareText', { title: newsletter.title });

    switch (platform) {
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
        break;
      case 'linkedin':
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
        break;
      case 'copy':
        navigator.clipboard.writeText(url);
        toast.success(t('viewer.shareCopied'));
        break;
    }
  };

  const handleToggleLike = () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }

    onToggleLike?.(newsletter.id);
  };

  const handleCommentSubmit = async () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }

    if (!stripCommentFormatting(commentDraft)) {
      toast.error(t('viewer.emptyComment'));
      return;
    }

    const newComment = await onAddComment?.(newsletter.id, commentDraft);
    if (!newComment) {
      return;
    }

    setCommentDraft('');
    toast.success(t('viewer.commentPosted'));
  };

  const handleCommentLike = (commentId: string) => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }

    onToggleCommentLike?.(newsletter.id, commentId);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className={cn('h-5 w-5', isRTL && 'rtl-rotate-180')} />
            <span className="text-sm font-semibold">{t('common.back')}</span>
          </button>
          <div className="flex items-center gap-3">
            <LanguageToggleButton compact />
            <button
              onClick={() => handleShare('copy')}
              className="p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              title="Copy link"
            >
              <HugeiconsIcon icon={Link01Icon} className="h-5 w-5" />
            </button>
            <button
              onClick={() => {
                onToggleBookmark?.(newsletter.id);
                toast.success(isBookmarked ? t('viewer.unbookmarked') : t('viewer.bookmarked'));
              }}
              className={cn(
                'p-2 transition-colors',
                isBookmarked
                  ? 'text-[var(--primary-accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
              title="Bookmark"
            >
              <HugeiconsIcon icon={isBookmarked ? BookmarkCheck01Icon : Bookmark01Icon} className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <article ref={articleRef} className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {newsletter.coverImage && (
          <div className="post-media-frame relative mb-8 h-64 md:h-auto md:aspect-video overflow-hidden rounded-3xl border border-[var(--border-subtle)] shadow-[var(--shadow-card)]">
            <img
              src={newsletter.coverImage}
              alt={newsletter.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t/srgb from-black/50 via-transparent to-transparent pointer-events-none" />
          </div>
        )}

        {newsletter.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {newsletter.tags.map((tag) => (
              <span key={tag} className="tag tag-red">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <h1 className="mb-4 text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight text-[var(--text-primary)] tracking-tight" dir="auto">
          {newsletter.title}
        </h1>

        {newsletter.subtitle && (
          <p className="mb-6 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed" dir="auto">
            {newsletter.subtitle}
          </p>
        )}

        <div className="mb-8 flex items-center justify-between border-y border-[var(--border-subtle)] py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-accent)]/15 border border-[var(--primary-accent)]/20 shadow-xs">
              <span className="text-base font-bold text-[var(--primary-accent)]">
                {getInitials(newsletter.author)}
              </span>
            </div>
            <div>
              <p className="font-bold text-sm text-[var(--text-primary)]">{newsletter.author}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {formatDate(newsletter.publishedAt, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
                <span className="mx-2">·</span>
                {newsletter.readTime}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-4 text-xs font-semibold text-[var(--text-secondary)] sm:flex">
            <span className="flex items-center gap-1.5 text-[var(--primary-accent)]">
              <HugeiconsIcon icon={Heart} className="h-4 w-4 fill-current" />
              {formatNumber(newsletter.likes)}
            </span>
            <span className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Message01Icon} className="h-4 w-4" />
              {formatNumber(newsletter.comments)}
            </span>
          </div>
        </div>

        {newsletter.hasAudio && (
          <div className="mb-8 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-xs">
            <div className="flex items-center gap-4">
              <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-accent)] text-[var(--accent-contrast)] transition-transform hover:scale-105 shadow-md">
                <HugeiconsIcon icon={PlayIcon} className="ml-0.5 h-5 w-5 fill-white text-white" />
              </button>
              <div className="flex-1">
                <p className="font-bold text-sm text-[var(--text-primary)]">{t('viewer.listen')}</p>
                <p className="text-xs text-[var(--text-secondary)]">{newsletter.audioDuration || '5:30'}</p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--bg-pill)]">
                  <div className="h-full w-1/3 rounded-full bg-[var(--primary-accent)]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {newsletter.contentLoaded === false ? (
          <div className="space-y-3 py-4" aria-busy="true" aria-label={t('app.loadingArticle')}>
            <div className="h-4 w-full animate-pulse rounded bg-[var(--bg-pill)]" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--bg-pill)]" />
          </div>
        ) : <NewsletterContent
          html={newsletter.content}
          className="newsletter-article"
          dir="auto"
        />}

        {/* Scheduled Event */}
        {newsletter.event && newsletter.event.title && (
          <div className="mt-8">
            <NewsletterEventCard
              event={newsletter.event}
              newsletterId={newsletter.id}
              currentUser={currentUser}
              onRsvp={onRsvpEvent}
              onRequireAuth={onRequireAuth}
              isInteractive={true}
            />
          </div>
        )}

        {/* Interactive Poll */}
        {newsletter.poll && newsletter.poll.question && (
          <div className="mt-8">
            <NewsletterPollCard
              poll={newsletter.poll}
              newsletterId={newsletter.id}
              currentUser={currentUser}
              onVote={onVotePoll}
              onRequireAuth={onRequireAuth}
              isInteractive={true}
            />
          </div>
        )}

        <section ref={discussionRef} className="mt-8 border-t border-[var(--border-subtle)] pt-6">
          <DeferredContent><CommentReply
            title={t('viewer.communityThreads')}
            likeCount={newsletter.likes}
            commentCount={newsletter.comments}
            isLiked={hasLikedNewsletter}
            comments={newsletter.commentItems}
            value={commentDraft}
            currentUser={currentUser}
            onChange={setCommentDraft}
            onSubmit={handleCommentSubmit}
            onToggleLike={handleToggleLike}
            onToggleCommentLike={handleCommentLike}
            onRequireAuth={onRequireAuth}
            formatCommentDate={formatRelativeTime}
          /></DeferredContent>
        </section>
      </article>
    </div>
  );
}
