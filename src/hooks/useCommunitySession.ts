import { useCallback, useEffect, useState } from 'react';
import { bootLogger } from '@/lib/bootLogger';
import {
  fetchCommunitySession,
  getPocketBaseErrorMessage,
  updateCommunityProfile,
} from '@/lib/pocketbase/community';
import type { CommunityProfile, CommunityProfilePatch, CommunitySession } from '@/types/community';

// GET /api/community/me creates the caller's community profile the first time
// it is requested, so this hook is what turns a newly signed-in account into a
// participant. Anonymous visitors get a null session and read-only screens.

export interface UseCommunitySessionResult {
  session: CommunitySession | null;
  profile: CommunityProfile | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveProfile: (patch: CommunityProfilePatch) => Promise<CommunityProfile>;
  setUnreadNotifications: (count: number) => void;
}

export function useCommunitySession(isAuthenticated: boolean): UseCommunitySessionResult {
  const [session, setSession] = useState<CommunitySession | null>(null);
  const [isLoading, setIsLoading] = useState(isAuthenticated);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setSession(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    try {
      const next = await fetchCommunitySession();
      setSession(next);
      setError(null);
      bootLogger.step('community', 'Community session loaded', {
        handle: next.profile.handle,
        canModerate: next.canModerate,
      });
    } catch (caught) {
      setSession(null);
      setError(getPocketBaseErrorMessage(caught, 'Loading your community profile failed'));
      bootLogger.warn('community', 'Community session request failed');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = useCallback(async (patch: CommunityProfilePatch) => {
    const profile = await updateCommunityProfile(patch);
    setSession((current) => (current ? { ...current, profile } : current));
    return profile;
  }, []);

  const setUnreadNotifications = useCallback((count: number) => {
    setSession((current) => (current ? { ...current, unreadNotifications: Math.max(0, count) } : current));
  }, []);

  return {
    session,
    profile: session?.profile ?? null,
    isLoading,
    error,
    refresh: load,
    saveProfile,
    setUnreadNotifications,
  };
}
