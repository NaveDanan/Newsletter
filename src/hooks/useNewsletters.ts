import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { canCreateNewsletter, canDeleteNewsletter, canEditNewsletter } from '@/lib/auth/permissions';
import { bootLogger } from '@/lib/bootLogger';
import { stripCommentFormatting } from '@/lib/comment-formatting';
import {
  fetchNewsletters,
  createNewsletter,
  patchNewsletter,
  removeNewsletter,
  uploadNewsletterPresentation,
} from '@/lib/pocketbase/newsletters';
import type { PocketBaseUser, UserRole } from '@/lib/pocketbase/client';
import type { Newsletter, NewsletterComment, NewsletterFormData } from '../types/newsletter';

interface UseNewslettersOptions {
  currentUser: PocketBaseUser | null;
  currentUserRole: UserRole | null;
}

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useNewsletters({ currentUser, currentUserRole }: UseNewslettersOptions) {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Initial fetch from PocketBase
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    bootLogger.once('newsletters:initial-fetch-start', () => {
      bootLogger.step('newsletters', 'Initial newsletter fetch started');
    });
    fetchNewsletters()
      .then((data) => {
        if (!cancelled) {
          setNewsletters(data);
          setError(null);
          bootLogger.success('newsletters', 'Initial newsletter fetch succeeded', {
            count: data.length,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load newsletters';
          console.error('useNewsletters fetch error:', err);
          setError(message);
          toast.error(`Newsletters: ${message}`);
          bootLogger.error('newsletters', 'Initial newsletter fetch failed', normalizeBootError(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          bootLogger.step('newsletters', 'Initial newsletter fetch finished');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
  }, [currentUser, currentUserRole]);

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
  }, [currentUser, currentUserRole, newsletters]);

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
  }, [currentUser?.id, currentUserRole, newsletters]);

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
  }, [currentUserRole]);

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
    if (!currentUser?.id) return null;

    const existing = newsletters.find((n) => n.id === id);
    if (!existing) return null;

    const hasLiked = existing.likedByUserIds.includes(currentUser.id);
    const likedByUserIds = hasLiked
      ? existing.likedByUserIds.filter((uid) => uid !== currentUser.id)
      : [...existing.likedByUserIds, currentUser.id];
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
  }, [currentUser?.id, newsletters]);

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
  }, [currentUser, newsletters]);

  // ---------------------------------------------------------------------------
  // Toggle comment like (optimistic)
  // ---------------------------------------------------------------------------
  const toggleCommentLike = useCallback(async (newsletterId: string, commentId: string): Promise<NewsletterComment | null> => {
    if (!currentUser?.id) return null;

    const newsletter = newsletters.find((n) => n.id === newsletterId);
    if (!newsletter) return null;

    const commentIndex = newsletter.commentItems.findIndex((c) => c.id === commentId);
    if (commentIndex === -1) return null;

    const existingComment = newsletter.commentItems[commentIndex];
    const hasLiked = existingComment.likedByUserIds.includes(currentUser.id);
    const updatedComment: NewsletterComment = {
      ...existingComment,
      likes: Math.max(0, existingComment.likes + (hasLiked ? -1 : 1)),
      likedByUserIds: hasLiked
        ? existingComment.likedByUserIds.filter((uid) => uid !== currentUser.id)
        : [...existingComment.likedByUserIds, currentUser.id],
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
  }, [currentUser?.id, newsletters]);

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
      const message = err instanceof Error ? err.message : 'Failed to upload PowerPoint file';
      toast.error(message);
      return null;
    }
  }, [currentUser?.id, currentUserRole, newsletters]);

  return {
    newsletters,
    isLoading,
    isLoaded: !isLoading,   // backwards-compat alias used in App.tsx
    error,
    addNewsletter,
    upsertDraftNewsletter,
    updateNewsletter,
    deleteNewsletter,
    getNewsletter,
    getPublishedNewsletters,
    getDraftNewsletters,
    toggleNewsletterLike,
    addNewsletterComment,
    toggleCommentLike,
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
