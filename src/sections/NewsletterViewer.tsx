import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Bookmark01Icon, Heart, Link01Icon, Message01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { CommentReply } from '@/components/ui/comment-reply';
import { useLocale } from '@/contexts/LocaleContext';
import { stripCommentFormatting } from '@/lib/comment-formatting';
import { cn } from '@/lib/utils';
import type { PocketBaseUser } from '@/lib/pocketbase/client';
import type { Newsletter, NewsletterComment } from '../types/newsletter';
import '../components/editor/EditorStyles.css';

interface NewsletterViewerProps {
  newsletter: Newsletter;
  onBack: () => void;
  currentUser?: PocketBaseUser | null;
  onRequireAuth?: () => void;
  onToggleLike?: (newsletterId: string) => void;
  onAddComment?: (newsletterId: string, body: string) => Promise<NewsletterComment | null> | NewsletterComment | null;
  onToggleCommentLike?: (newsletterId: string, commentId: string) => void;
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
}: NewsletterViewerProps) {
  const { formatDate, formatNumber, formatRelativeTime, isRTL, t } = useLocale();
  const articleRef = useRef<HTMLDivElement>(null);
  const discussionRef = useRef<HTMLDivElement>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const isAuthenticated = Boolean(currentUser?.id);
  const hasLikedNewsletter = Boolean(currentUser?.id && newsletter.likedByUserIds.includes(currentUser.id));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [newsletter]);

  useEffect(() => {
    setCommentDraft('');
  }, [newsletter.id]);

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
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-[#E5E5E5] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#737373] transition-colors hover:text-[#171717]"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className={cn('h-5 w-5', isRTL && 'rtl-rotate-180')} />
            <span className="text-sm font-medium">{t('common.back')}</span>
          </button>
          <div className="flex items-center gap-2">
            <LanguageToggleButton compact />
            <button
              onClick={() => handleShare('copy')}
              className="p-2 text-[#737373] transition-colors hover:text-[#171717]"
            >
              <HugeiconsIcon icon={Link01Icon} className="h-5 w-5" />
            </button>
            <button className="p-2 text-[#737373] transition-colors hover:text-[#171717]">
              <HugeiconsIcon icon={Bookmark01Icon} className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <article ref={articleRef} className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {newsletter.coverImage && (
          <div className="relative mb-8 h-64 overflow-hidden rounded-2xl sm:h-80 lg:h-96">
            <img
              src={newsletter.coverImage}
              alt={newsletter.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        )}

        {newsletter.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {newsletter.tags.map((tag) => (
              <span key={tag} className="tag tag-red">
                {tag}
              </span>
            ))}
          </div>
        )}

        <h1 className="mb-4 text-3xl font-bold leading-tight text-[#171717] sm:text-4xl lg:text-5xl" dir="auto">
          {newsletter.title}
        </h1>

        {newsletter.subtitle && (
          <p className="mb-6 text-xl text-[#737373]" dir="auto">
            {newsletter.subtitle}
          </p>
        )}

        <div className="mb-8 flex items-center justify-between border-y border-[#E5E5E5] py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D93A3A]/10">
              <span className="text-lg font-semibold text-[#D93A3A]">
                {getInitials(newsletter.author)}
              </span>
            </div>
            <div>
              <p className="font-semibold text-[#171717]">{newsletter.author}</p>
              <p className="text-sm text-[#737373]">
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

          <div className="hidden items-center gap-4 text-sm text-[#737373] sm:flex">
            <span className="flex items-center gap-1">
              <HugeiconsIcon icon={Heart} className="h-4 w-4" />
              {formatNumber(newsletter.likes)}
            </span>
            <span className="flex items-center gap-1">
              <HugeiconsIcon icon={Message01Icon} className="h-4 w-4" />
              {formatNumber(newsletter.comments)}
            </span>
          </div>
        </div>

        {newsletter.hasAudio && (
          <div className="mb-8 rounded-xl bg-[#F9FAFB] p-4">
            <div className="flex items-center gap-4">
              <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D93A3A] transition-colors hover:bg-[#B91C1C]">
                <HugeiconsIcon icon={PlayIcon} className="ml-0.5 h-5 w-5 fill-white text-white" />
              </button>
              <div className="flex-1">
                <p className="font-medium text-[#171717]">{t('viewer.listen')}</p>
                <p className="text-sm text-[#737373]">{newsletter.audioDuration || '5:30'}</p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <div className="h-1 w-32 overflow-hidden rounded-full bg-[#E5E5E5]">
                  <div className="h-full w-1/3 rounded-full bg-[#D93A3A]" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          className="newsletter-article"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: newsletter.content }}
        />

        {/* <div className="mt-10 grid gap-4 rounded-[2rem] border border-[#E5E5E5] bg-[#FAFAFA] p-4 sm:grid-cols-3 sm:p-5">
          <button
            onClick={handleToggleLike}
            className={`group flex items-center justify-between rounded-[1.4rem] border px-5 py-4 text-left transition-all ${
              hasLikedNewsletter
                ? 'border-[#D93A3A]/30 bg-[#D93A3A] text-white shadow-[0_18px_50px_-28px_rgba(217,58,58,0.85)]'
                : 'border-[#E5E5E5] bg-white text-[#171717] hover:border-[#D93A3A]/30 hover:bg-[#FFF6F6]'
            }`}
          >
            <span>
              <span className="block text-xs uppercase tracking-[0.22em] opacity-70">Like</span>
              <span className="mt-2 block text-2xl font-semibold">{newsletter.likes}</span>
            </span>
            <HugeiconsIcon icon={Heart} className={`h-6 w-6 ${hasLikedNewsletter ? 'fill-current' : 'group-hover:text-[#D93A3A]'}`} />
          </button>

          <button
            onClick={jumpToDiscussion}
            className="group flex items-center justify-between rounded-[1.4rem] border border-[#E5E5E5] bg-white px-5 py-4 text-left text-[#171717] transition-all hover:border-[#D93A3A]/30 hover:bg-[#FFF6F6]"
          >
            <span>
              <span className="block text-xs uppercase tracking-[0.22em] text-[#737373]">Comments</span>
              <span className="mt-2 block text-2xl font-semibold">{newsletter.comments}</span>
            </span>
            <MessageSquare className="h-6 w-6 text-[#737373] transition-colors group-hover:text-[#D93A3A]" />
          </button>

          <button
            onClick={() => handleShare('copy')}
            className="group flex items-center justify-between rounded-[1.4rem] border border-[#E5E5E5] bg-white px-5 py-4 text-left text-[#171717] transition-all hover:border-[#D93A3A]/30 hover:bg-[#FFF6F6]"
          >
            <span>
              <span className="block text-xs uppercase tracking-[0.22em] text-[#737373]">Share</span>
              <span className="mt-2 block text-2xl font-semibold">{newsletter.shares}</span>
            </span>
            <Share2 className="h-6 w-6 text-[#737373] transition-colors group-hover:text-[#D93A3A]" />
          </button>
        </div> */}

        <section ref={discussionRef} className="mt-4 border-t border-[#E5E5E5] pt-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {/* <p className="text-xs uppercase tracking-[0.24em] text-[#D93A3A]">Community Threads</p> */}
              {/* <h2 className="mt-2 text-3xl font-semibold text-[#171717]">Discuss this newsletter</h2> */}
            </div>
            {/* <p className="max-w-sm text-sm leading-6 text-[#737373]">
              Registered readers can like the article, leave a comment, and react to comments from other members.
            </p> */}
          </div>

          <CommentReply
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
          />
        </section>
      </article>
    </div>
  );
}
