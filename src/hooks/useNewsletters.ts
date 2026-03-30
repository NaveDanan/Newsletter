import { useState, useEffect, useCallback } from 'react';
import { writeStoredValue } from '../lib/localStorage';
import { canCreateNewsletter, canDeleteNewsletter, canEditNewsletter } from '@/lib/auth/permissions';
import { stripCommentFormatting } from '@/lib/comment-formatting';
import type { PocketBaseUser, UserRole } from '@/lib/pocketbase/client';
import type { Newsletter, NewsletterComment, NewsletterFormData } from '../types/newsletter';
import {
  calculateReadTime,
  extractExcerpt,
  loadNewsletters,
  NEWSLETTER_STORAGE_KEY,
} from '../lib/newsletters';

function hasMeaningfulDraftContent(data: Partial<NewsletterFormData>): boolean {
  const plainContent = (data.content ?? '').replace(/<[^>]*>/g, '').trim();

  return Boolean(
    data.title?.trim() ||
    data.subtitle?.trim() ||
    plainContent ||
    data.author?.trim() ||
    data.coverImage?.trim() ||
    data.tags?.length
  );
}

interface UseNewslettersOptions {
  currentUser: PocketBaseUser | null;
  currentUserRole: UserRole | null;
}

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useNewsletters({ currentUser, currentUserRole }: UseNewslettersOptions) {
  const [newsletters, setNewsletters] = useState<Newsletter[]>(() => loadNewsletters());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever newsletters change
  useEffect(() => {
    if (isLoaded) {
      writeStoredValue(NEWSLETTER_STORAGE_KEY, newsletters);
    }
  }, [newsletters, isLoaded]);

  const addNewsletter = useCallback((data: NewsletterFormData): Newsletter | null => {
    if (!canCreateNewsletter(currentUserRole)) {
      return null;
    }

    const newNewsletter: Newsletter = {
      id: createClientId(),
      ...data,
      createdById: currentUser?.id,
      excerpt: extractExcerpt(data.content),
      publishedAt: new Date().toISOString().split('T')[0],
      readTime: calculateReadTime(data.content),
      likes: 0,
      comments: 0,
      shares: 0,
      likedByUserIds: [],
      commentItems: [],
    };
    setNewsletters(prev => {
      const next = [newNewsletter, ...prev];
      writeStoredValue(NEWSLETTER_STORAGE_KEY, next);
      return next;
    });
    return newNewsletter;
  }, [currentUser?.id, currentUserRole]);

  const upsertDraftNewsletter = useCallback((
    id: string | null,
    data: Partial<NewsletterFormData>,
  ): Newsletter | null => {
    if (!canCreateNewsletter(currentUserRole)) {
      return null;
    }

    if (id) {
      let updated: Newsletter | null = null;

      setNewsletters(prev => {
        const index = prev.findIndex(n => n.id === id);
        if (index === -1) {
          return prev;
        }

        const existing = prev[index];
        if (!canEditNewsletter(currentUserRole, currentUser?.id, existing)) {
          return prev;
        }

        updated = {
          ...existing,
          ...data,
          status: 'draft',
          excerpt: extractExcerpt(data.content ?? existing.content),
          readTime: calculateReadTime(data.content ?? existing.content),
        };

        const next = [...prev];
        next[index] = updated;
        writeStoredValue(NEWSLETTER_STORAGE_KEY, next);
        return next;
      });

      return updated;
    }

    if (!hasMeaningfulDraftContent(data)) {
      return null;
    }

    const newDraft: Newsletter = {
      id: createClientId(),
      title: data.title?.trim() || 'Untitled Draft',
      subtitle: data.subtitle ?? '',
      content: data.content ?? '',
      excerpt: extractExcerpt(data.content ?? ''),
      author: data.author ?? currentUser?.name ?? '',
      authorAvatar: currentUser?.avatar ?? '',
      createdById: currentUser?.id,
      publishedAt: new Date().toISOString().split('T')[0],
      readTime: calculateReadTime(data.content ?? ''),
      coverImage: data.coverImage ?? '',
      likes: 0,
      comments: 0,
      shares: 0,
      tags: data.tags ?? [],
      status: 'draft',
      likedByUserIds: [],
      commentItems: [],
    };

    setNewsletters(prev => {
      const next = [newDraft, ...prev];
      writeStoredValue(NEWSLETTER_STORAGE_KEY, next);
      return next;
    });
    return newDraft;
  }, [currentUser?.avatar, currentUser?.id, currentUser?.name, currentUserRole]);

  const updateNewsletter = useCallback((id: string, data: Partial<NewsletterFormData>): Newsletter | null => {
    let updated: Newsletter | null = null;
    setNewsletters(prev => {
      const index = prev.findIndex(n => n.id === id);
      if (index === -1) return prev;
      
      const existing = prev[index];
      if (!canEditNewsletter(currentUserRole, currentUser?.id, existing)) {
        return prev;
      }

      updated = {
        ...existing,
        ...data,
        excerpt: data.content !== undefined
          ? extractExcerpt(data.content)
          : existing.excerpt,
        readTime: data.content !== undefined
          ? calculateReadTime(data.content)
          : existing.readTime,
      };
      
      const newArray = [...prev];
      newArray[index] = updated;
      writeStoredValue(NEWSLETTER_STORAGE_KEY, newArray);
      return newArray;
    });
    return updated;
  }, [currentUser?.id, currentUserRole]);

  const deleteNewsletter = useCallback((id: string): boolean => {
    if (!canDeleteNewsletter(currentUserRole)) {
      return false;
    }

    let found = false;
    setNewsletters(prev => {
      const filtered = prev.filter(n => n.id !== id);
      found = filtered.length !== prev.length;
      writeStoredValue(NEWSLETTER_STORAGE_KEY, filtered);
      return filtered;
    });
    return found;
  }, [currentUserRole]);

  const getNewsletter = useCallback((id: string): Newsletter | undefined => {
    return newsletters.find(n => n.id === id);
  }, [newsletters]);

  const getPublishedNewsletters = useCallback((): Newsletter[] => {
    return newsletters.filter(n => n.status === 'published');
  }, [newsletters]);

  const getDraftNewsletters = useCallback((): Newsletter[] => {
    return newsletters.filter(n => n.status === 'draft');
  }, [newsletters]);

  const toggleNewsletterLike = useCallback((id: string): Newsletter | null => {
    if (!currentUser?.id) {
      return null;
    }

    let updated: Newsletter | null = null;

    setNewsletters(prev => {
      const index = prev.findIndex(n => n.id === id);
      if (index === -1) {
        return prev;
      }

      const existing = prev[index];
      const hasLiked = existing.likedByUserIds.includes(currentUser.id);
      const likedByUserIds = hasLiked
        ? existing.likedByUserIds.filter((userId) => userId !== currentUser.id)
        : [...existing.likedByUserIds, currentUser.id];

      updated = {
        ...existing,
        likes: Math.max(0, existing.likes + (hasLiked ? -1 : 1)),
        likedByUserIds,
      };

      const next = [...prev];
      next[index] = updated;
      writeStoredValue(NEWSLETTER_STORAGE_KEY, next);
      return next;
    });

    return updated;
  }, [currentUser?.id]);

  const addNewsletterComment = useCallback((id: string, body: string): NewsletterComment | null => {
    if (!currentUser?.id) {
      return null;
    }

    const trimmedBody = body.trim();
    if (!trimmedBody || !stripCommentFormatting(trimmedBody)) {
      return null;
    }

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

    setNewsletters(prev => {
      const index = prev.findIndex(n => n.id === id);
      if (index === -1) {
        return prev;
      }

      const existing = prev[index];
      const updated: Newsletter = {
        ...existing,
        comments: existing.comments + 1,
        commentItems: [newComment, ...existing.commentItems],
      };

      const next = [...prev];
      next[index] = updated;
      writeStoredValue(NEWSLETTER_STORAGE_KEY, next);
      return next;
    });

    return newComment;
  }, [currentUser]);

  const toggleCommentLike = useCallback((newsletterId: string, commentId: string): NewsletterComment | null => {
    if (!currentUser?.id) {
      return null;
    }

    let updatedComment: NewsletterComment | null = null;

    setNewsletters(prev => {
      const newsletterIndex = prev.findIndex(n => n.id === newsletterId);
      if (newsletterIndex === -1) {
        return prev;
      }

      const newsletter = prev[newsletterIndex];
      const commentIndex = newsletter.commentItems.findIndex((comment) => comment.id === commentId);
      if (commentIndex === -1) {
        return prev;
      }

      const existingComment = newsletter.commentItems[commentIndex];
      const hasLiked = existingComment.likedByUserIds.includes(currentUser.id);
      updatedComment = {
        ...existingComment,
        likes: Math.max(0, existingComment.likes + (hasLiked ? -1 : 1)),
        likedByUserIds: hasLiked
          ? existingComment.likedByUserIds.filter((userId) => userId !== currentUser.id)
          : [...existingComment.likedByUserIds, currentUser.id],
      };

      const commentItems = [...newsletter.commentItems];
      commentItems[commentIndex] = updatedComment;

      const updatedNewsletter: Newsletter = {
        ...newsletter,
        commentItems,
      };

      const next = [...prev];
      next[newsletterIndex] = updatedNewsletter;
      writeStoredValue(NEWSLETTER_STORAGE_KEY, next);
      return next;
    });

    return updatedComment;
  }, [currentUser?.id]);

  return {
    newsletters,
    isLoaded,
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
  };
}
