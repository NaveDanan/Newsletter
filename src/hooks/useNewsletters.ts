import { useState, useEffect, useCallback, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { canCreateNewsletter, canDeleteNewsletter, canEditNewsletter } from '@/lib/auth/permissions';
import { bootLogger } from '@/lib/bootLogger';
import { stripCommentFormatting } from '@/lib/comment-formatting';
import {
  fetchNewsletters,
  fetchNewsletter,
  getCachedNewsletters,
  getCachedNewsletter,
  getStoredNewsletter,
  rememberNewsletters,
  createNewsletter,
  patchNewsletter,
  removeNewsletter,
  sendNewsletterUpdateEmail,
  uploadNewsletterPresentation,
} from '@/lib/pocketbase/newsletters';
import { readScope } from '@/lib/pocketbase/read-cache';
import type { PocketBaseUser, UserRole } from '@/lib/pocketbase/client';
import type { Newsletter, NewsletterComment, NewsletterFormData } from '../types/newsletter';

interface UseNewslettersOptions {
  currentUser: PocketBaseUser | null;
  currentUserRole: UserRole | null;
  enabled?: boolean;
  articleId?: string;
}

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useNewsletters({ currentUser, currentUserRole, enabled = true, articleId }: UseNewslettersOptions) {
  const scope = readScope();
  const [newsletters, commitNewsletters] = useState<Newsletter[]>(() => {
    const list = getCachedNewsletters() ?? [];
    const article = articleId ? getCachedNewsletter(articleId) : undefined;
    return article ? [article, ...list.filter((item) => item.id !== article.id)] : list;
  });
  const setNewsletters = useCallback((next: SetStateAction<Newsletter[]>) => {
    if (scope === readScope()) commitNewsletters(next);
  }, [scope]);
  const [isLoading, setIsLoading] = useState(enabled && newsletters.length === 0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [hasList, setHasList] = useState(() => Boolean(getCachedNewsletters()));
  const [error, setError] = useState<string | null>(null);
  const currentUserId = currentUser?.id;

  // Clear private rows on account changes, while preserving the feed on Back.
  const [lastScope, setLastScope] = useState(scope);
  if (lastScope !== scope) {
    setLastScope(scope);
    setHasLoaded(false);
    setLoadedFor(null);
    setHasList(Boolean(getCachedNewsletters()));
    setError(null);
    setNewsletters(getCachedNewsletters() ?? []);
    setIsLoading(enabled);
  }

  // ---------------------------------------------------------------------------
  // Initial fetch from PocketBase
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let networkFinished = false;
    if (articleId) void getStoredNewsletter(articleId).then((article) => {
      if (article && !cancelled && !networkFinished) setNewsletters((current) => [article, ...current.filter((item) => item.id !== articleId)]);
    });

    bootLogger.once('newsletters:initial-fetch-start', () => {
      bootLogger.step('newsletters', 'Initial newsletter fetch started');
    });
    const request = articleId ? fetchNewsletter(articleId).then((article) => [article]) : fetchNewsletters({ summary: true, force: true });
    request
      .then((data) => {
        networkFinished = true;
        if (!cancelled) {
          setNewsletters((current) => articleId
            ? [...data, ...current.filter((item) => item.id !== articleId)]
            : data.map((item) => {
              const full = current.find((cached) => cached.id === item.id && cached.contentLoaded !== false && cached.updatedAt === item.updatedAt);
              return full ? { ...full, ...item, content: full.content, contentLoaded: true, commentItems: full.commentItems, presentationFiles: full.presentationFiles, presentationPreviews: full.presentationPreviews } : item;
            }));
          setError(null);
          if (!articleId) setHasList(true);
          bootLogger.success('newsletters', 'Initial newsletter fetch succeeded', {
            count: data.length,
          });
        }
      })
      .catch((err: unknown) => {
        networkFinished = true;
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load newsletters';
          console.error('useNewsletters fetch error:', err);
          setError(message);
          if (articleId && err && typeof err === 'object' && 'status' in err && (err.status === 403 || err.status === 404)) setNewsletters((current) => current.filter((item) => item.id !== articleId));
          toast.error(`Newsletters: ${message}`);
          bootLogger.error('newsletters', 'Initial newsletter fetch failed', normalizeBootError(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHasLoaded(true);
          setLoadedFor(articleId ?? 'list');
          setIsLoading(false);
          bootLogger.step('newsletters', 'Initial newsletter fetch finished');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [articleId, enabled, scope, setNewsletters]);

  useEffect(() => {
    if (hasList && lastScope === scope) rememberNewsletters(newsletters);
  }, [hasList, lastScope, newsletters, scope]);

  const loadNewsletter = useCallback(async (id: string): Promise<Newsletter | null> => {
    const requestedScope = readScope();
    try {
      const article = await fetchNewsletter(id);
      if (readScope() !== requestedScope) return null;
      setNewsletters((current) => [article, ...current.filter((item) => item.id !== id)]);
      return article;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load newsletter');
      return null;
    }
  }, [setNewsletters]);

  const refreshNewsletters = useCallback(async () => {
    if (!enabled) return;
    const requestedScope = readScope();
    try {
      const items = await fetchNewsletters({ summary: true, force: true });
      if (requestedScope !== readScope()) return;
      setNewsletters((current) => items.map((item) => {
        const full = current.find((cached) => cached.id === item.id && cached.contentLoaded !== false && cached.updatedAt === item.updatedAt);
        return full ? { ...full, ...item, content: full.content, contentLoaded: true, commentItems: full.commentItems, presentationFiles: full.presentationFiles, presentationPreviews: full.presentationPreviews } : item;
      }));
      setError(null);
    } catch (err) {
      if (requestedScope !== readScope()) return;
      const message = err instanceof Error ? err.message : 'Failed to refresh newsletters';
      setError(message);
      toast.error(message);
    }
  }, [enabled, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Add (publish immediately)
  // ---------------------------------------------------------------------------
  const addNewsletter = useCallback(async (data: NewsletterFormData): Promise<Newsletter | null> => {
    if (!canCreateNewsletter(currentUserRole)) {
      return null;
    }
    try {
      const created = await createNewsletter(data, {
        createdById: currentUser?.id,
        authorAvatar: currentUser?.avatar,
      });
      setNewsletters((prev) => [created, ...prev]);
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create newsletter';
      toast.error(message);
      return null;
    }
  }, [currentUser, currentUserRole, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Upsert draft (auto-save while editing)
  // ---------------------------------------------------------------------------
  const upsertDraftNewsletter = useCallback(async (
    id: string | null,
    data: Partial<NewsletterFormData>,
  ): Promise<Newsletter | null> => {
    if (!canCreateNewsletter(currentUserRole)) {
      return null;
    }

    // Update existing draft
    if (id) {
      const existing = newsletters.find((n) => n.id === id);
      if (!existing) return null;
      if (!canEditNewsletter(currentUserRole, currentUser?.id, existing)) return null;

      try {
        const updated = await patchNewsletter(id, { ...data, status: 'draft' });
        setNewsletters((prev) => prev.map((n) => (n.id === id ? updated : n)));
        return updated;
      } catch (err) {
        console.error('upsertDraftNewsletter update error:', err);
        return null;
      }
    }

    // Check there's something meaningful to save
    const plainContent = (data.content ?? '').replace(/<[^>]*>/g, '').trim();
    const hasMeaningfulContent = Boolean(
      data.title?.trim() || data.subtitle?.trim() || plainContent || data.author?.trim(),
    );
    if (!hasMeaningfulContent) return null;

    // Create new draft
    try {
      const draftData: NewsletterFormData = {
        title: data.title?.trim() || 'Untitled Draft',
        subtitle: data.subtitle ?? '',
        content: data.content ?? '',
        author: data.author ?? currentUser?.name ?? '',
        coverImage: data.coverImage ?? '',
        tags: data.tags ?? [],
        status: 'draft',
      };
      const created = await createNewsletter(draftData, {
        createdById: currentUser?.id,
        authorAvatar: currentUser?.avatar,
      });
      setNewsletters((prev) => [created, ...prev]);
      return created;
    } catch (err) {
      console.error('upsertDraftNewsletter create error:', err);
      return null;
    }
  }, [currentUser, currentUserRole, newsletters, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Update newsletter
  // ---------------------------------------------------------------------------
  const updateNewsletter = useCallback(async (id: string, data: Partial<NewsletterFormData>): Promise<Newsletter | null> => {
    const existing = newsletters.find((n) => n.id === id);
    if (!existing) return null;
    if (!canEditNewsletter(currentUserRole, currentUser?.id, existing)) return null;

    try {
      const updated = await patchNewsletter(id, data);
      setNewsletters((prev) => prev.map((n) => (n.id === id ? updated : n)));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update newsletter';
      toast.error(message);
      return null;
    }
  }, [currentUser?.id, currentUserRole, newsletters, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  const deleteNewsletter = useCallback(async (id: string): Promise<boolean> => {
    if (!canDeleteNewsletter(currentUserRole)) {
      return false;
    }
    try {
      await removeNewsletter(id);
      setNewsletters((prev) => prev.filter((n) => n.id !== id));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete newsletter';
      toast.error(message);
      return false;
    }
  }, [currentUserRole, setNewsletters]);

  const sendNewsletterUpdate = useCallback(async (id: string): Promise<number | null> => {
    if (currentUserRole !== 'admin') {
      return null;
    }

    const existing = newsletters.find((newsletter) => newsletter.id === id);
    if (!existing || existing.status !== 'published') {
      return null;
    }

    try {
      return await sendNewsletterUpdateEmail(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send newsletter email';
      toast.error(message);
      return null;
    }
  }, [currentUserRole, newsletters]);

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------
  const getNewsletter = useCallback((id: string): Newsletter | undefined => {
    return newsletters.find((n) => n.id === id);
  }, [newsletters]);

  const getPublishedNewsletters = useCallback((): Newsletter[] => {
    return newsletters.filter((n) => n.status === 'published');
  }, [newsletters]);

  const getDraftNewsletters = useCallback((): Newsletter[] => {
    return newsletters.filter((n) => n.status === 'draft');
  }, [newsletters]);

  // ---------------------------------------------------------------------------
  // Like toggle (optimistic)
  // ---------------------------------------------------------------------------
  const toggleNewsletterLike = useCallback(async (id: string): Promise<Newsletter | null> => {
    if (!currentUserId) return null;

    const existing = newsletters.find((n) => n.id === id);
    if (!existing) return null;

    const hasLiked = existing.likedByUserIds.includes(currentUserId);
    const likedByUserIds = hasLiked
      ? existing.likedByUserIds.filter((uid) => uid !== currentUserId)
      : [...existing.likedByUserIds, currentUserId];
    const likes = Math.max(0, existing.likes + (hasLiked ? -1 : 1));

    // Optimistic
    const optimistic: Newsletter = { ...existing, likes, likedByUserIds };
    setNewsletters((prev) => prev.map((n) => (n.id === id ? optimistic : n)));

    try {
      const updated = await patchNewsletter(id, { likes, likedByUserIds });
      setNewsletters((prev) => prev.map((n) => (n.id === id ? updated : n)));
      return updated;
    } catch (err) {
      // Revert
      setNewsletters((prev) => prev.map((n) => (n.id === id ? existing : n)));
      console.error('toggleNewsletterLike error:', err);
      return null;
    }
  }, [currentUserId, newsletters, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Add comment (optimistic)
  // ---------------------------------------------------------------------------
  const addNewsletterComment = useCallback(async (id: string, body: string): Promise<NewsletterComment | null> => {
    if (!currentUser?.id) return null;

    const trimmedBody = body.trim();
    if (!trimmedBody || !stripCommentFormatting(trimmedBody)) return null;

    const existing = newsletters.find((n) => n.id === id);
    if (!existing) return null;

    const newComment: NewsletterComment = {
      id: createClientId(),
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      body: trimmedBody,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedByUserIds: [],
    };

    const commentItems = [newComment, ...existing.commentItems];
    const comments = existing.comments + 1;

    // Optimistic
    setNewsletters((prev) =>
      prev.map((n) => (n.id === id ? { ...n, comments, commentItems } : n)),
    );

    try {
      const updated = await patchNewsletter(id, { comments, commentItems });
      setNewsletters((prev) => prev.map((n) => (n.id === id ? updated : n)));
      return newComment;
    } catch (err) {
      // Revert
      setNewsletters((prev) => prev.map((n) => (n.id === id ? existing : n)));
      console.error('addNewsletterComment error:', err);
      return null;
    }
  }, [currentUser, newsletters, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Toggle comment like (optimistic)
  // ---------------------------------------------------------------------------
  const toggleCommentLike = useCallback(async (newsletterId: string, commentId: string): Promise<NewsletterComment | null> => {
    if (!currentUserId) return null;

    const newsletter = newsletters.find((n) => n.id === newsletterId);
    if (!newsletter) return null;

    const commentIndex = newsletter.commentItems.findIndex((c) => c.id === commentId);
    if (commentIndex === -1) return null;

    const existingComment = newsletter.commentItems[commentIndex];
    const hasLiked = existingComment.likedByUserIds.includes(currentUserId);
    const updatedComment: NewsletterComment = {
      ...existingComment,
      likes: Math.max(0, existingComment.likes + (hasLiked ? -1 : 1)),
      likedByUserIds: hasLiked
        ? existingComment.likedByUserIds.filter((uid) => uid !== currentUserId)
        : [...existingComment.likedByUserIds, currentUserId],
    };

    const commentItems = [...newsletter.commentItems];
    commentItems[commentIndex] = updatedComment;

    // Optimistic
    setNewsletters((prev) =>
      prev.map((n) => (n.id === newsletterId ? { ...n, commentItems } : n)),
    );

    try {
      const updated = await patchNewsletter(newsletterId, { commentItems });
      setNewsletters((prev) => prev.map((n) => (n.id === newsletterId ? updated : n)));
      return updatedComment;
    } catch (err) {
      // Revert
      setNewsletters((prev) => prev.map((n) => (n.id === newsletterId ? newsletter : n)));
      console.error('toggleCommentLike error:', err);
      return null;
    }
  }, [currentUserId, newsletters, setNewsletters]);

  const uploadPresentation = useCallback(async (id: string, file: File) => {
    const existing = newsletters.find((newsletter) => newsletter.id === id);
    if (!existing) return null;
    if (!canEditNewsletter(currentUserRole, currentUser?.id, existing)) return null;

    try {
      const uploaded = await uploadNewsletterPresentation(id, file);
      setNewsletters((prev) => prev.map((newsletter) => (
        newsletter.id === id ? uploaded.newsletter : newsletter
      )));
      return uploaded;
    } catch (err) {
      const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status?: unknown }).status) : 0;
      const rawMessage = err instanceof Error ? err.message : 'Failed to upload PowerPoint file';
      const message = status === 413
        ? 'PowerPoint files must be 100 MB or smaller. If the file is smaller, check the ingress body-size limit.'
        : /only powerpoint|only.*pptx/i.test(rawMessage)
          ? 'Only PowerPoint .pptx files are supported.'
          : /conversion|preview|soffice|pdftoppm|libreoffice/i.test(rawMessage)
            ? `The PowerPoint was uploaded, but slide preview generation failed: ${rawMessage}`
            : rawMessage;
      toast.error(message);
      return null;
    }
  }, [currentUser?.id, currentUserRole, newsletters, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Bookmark toggle (optimistic)
  // ---------------------------------------------------------------------------
  const toggleBookmark = useCallback(async (id: string): Promise<Newsletter | null> => {
    if (!currentUserId) return null;

    const existing = newsletters.find((n) => n.id === id);
    if (!existing) return null;

    const hasBookmarked = existing.bookmarkedByUserIds.includes(currentUserId);
    const bookmarkedByUserIds = hasBookmarked
      ? existing.bookmarkedByUserIds.filter((uid) => uid !== currentUserId)
      : [...existing.bookmarkedByUserIds, currentUserId];

    // Optimistic
    const optimistic: Newsletter = { ...existing, bookmarkedByUserIds };
    setNewsletters((prev) => prev.map((n) => (n.id === id ? optimistic : n)));

    try {
      const updated = await patchNewsletter(id, { bookmarkedByUserIds });
      setNewsletters((prev) => prev.map((n) => (n.id === id ? updated : n)));
      return updated;
    } catch (err) {
      // Revert
      setNewsletters((prev) => prev.map((n) => (n.id === id ? existing : n)));
      console.error('toggleBookmark error:', err);
      return null;
    }
  }, [currentUserId, newsletters, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Poll vote (optimistic)
  // ---------------------------------------------------------------------------
  const voteNewsletterPoll = useCallback(async (newsletterId: string, optionId: string): Promise<Newsletter | null> => {
    if (!currentUserId) {
      return null;
    }

    const newsletter = newsletters.find((n) => n.id === newsletterId);
    if (!newsletter || !newsletter.poll) return null;

    if (newsletter.poll.closed) {
      return null;
    }

    const currentPoll = newsletter.poll;
    const existingVotedOption = currentPoll.options.find((opt) => opt.voterUserIds.includes(currentUserId));
    const isUnvoting = existingVotedOption?.id === optionId;

    const nextOptions = currentPoll.options.map((opt) => {
      const filteredVoters = opt.voterUserIds.filter((uid) => uid !== currentUserId);
      if (!isUnvoting && opt.id === optionId) {
        filteredVoters.push(currentUserId);
      }
      return {
        ...opt,
        voterUserIds: filteredVoters,
        votes: filteredVoters.length,
      };
    });

    const updatedPoll = {
      ...currentPoll,
      options: nextOptions,
    };

    const optimistic: Newsletter = { ...newsletter, poll: updatedPoll };
    setNewsletters((prev) => prev.map((n) => (n.id === newsletterId ? optimistic : n)));

    try {
      const updated = await patchNewsletter(newsletterId, { poll: updatedPoll });
      setNewsletters((prev) => prev.map((n) => (n.id === newsletterId ? updated : n)));
      return updated;
    } catch (err) {
      setNewsletters((prev) => prev.map((n) => (n.id === newsletterId ? newsletter : n)));
      console.error('voteNewsletterPoll error:', err);
      return null;
    }
  }, [currentUserId, newsletters, setNewsletters]);

  // ---------------------------------------------------------------------------
  // Event RSVP (optimistic)
  // ---------------------------------------------------------------------------
  const rsvpNewsletterEvent = useCallback(async (newsletterId: string): Promise<Newsletter | null> => {
    if (!currentUser?.id) {
      return null;
    }

    const newsletter = newsletters.find((n) => n.id === newsletterId);
    if (!newsletter || !newsletter.event) return null;

    const currentEvent = newsletter.event;
    const isAttending = currentEvent.attendees.some((a) => a.userId === currentUser.id);

    const nextAttendees = isAttending
      ? currentEvent.attendees.filter((a) => a.userId !== currentUser.id)
      : [
          ...currentEvent.attendees,
          {
            userId: currentUser.id,
            name: currentUser.name || 'User',
            avatar: currentUser.avatar,
            rsvpAt: new Date().toISOString(),
          },
        ];

    const updatedEvent = {
      ...currentEvent,
      attendees: nextAttendees,
    };

    const optimistic: Newsletter = { ...newsletter, event: updatedEvent };
    setNewsletters((prev) => prev.map((n) => (n.id === newsletterId ? optimistic : n)));

    try {
      const updated = await patchNewsletter(newsletterId, { event: updatedEvent });
      setNewsletters((prev) => prev.map((n) => (n.id === newsletterId ? updated : n)));
      return updated;
    } catch (err) {
      setNewsletters((prev) => prev.map((n) => (n.id === newsletterId ? newsletter : n)));
      console.error('rsvpNewsletterEvent error:', err);
      return null;
    }
  }, [currentUser, newsletters, setNewsletters]);

  return {
    newsletters,
    hasNewsletterList: hasList,
    loadNewsletter,
    isLoading,
    refreshNewsletters,
    isLoaded: enabled && hasLoaded && loadedFor === (articleId ?? 'list') && !isLoading,
    error,
    addNewsletter,
    upsertDraftNewsletter,
    updateNewsletter,
    deleteNewsletter,
    sendNewsletterUpdate,
    getNewsletter,
    getPublishedNewsletters,
    getDraftNewsletters,
    toggleNewsletterLike,
    addNewsletterComment,
    toggleCommentLike,
    toggleBookmark,
    voteNewsletterPoll,
    rsvpNewsletterEvent,
    uploadPresentation,
  };
}

function normalizeBootError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}
