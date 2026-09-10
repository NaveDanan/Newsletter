import { createContext, useContext, type ReactNode } from 'react';
import type { CommunityPost, CommunityProfile, CommunitySearchType, CommunitySession } from '@/types/community';

// Nearly every card in the community screens needs the same four things: who is
// looking, how to move to another community route, how to bounce an anonymous
// visitor to sign-in, and how to open the composer for a reply or a quote.
// Threading those through six levels of props would drown the components, so
// they travel in a context the way LocaleContext and AuthContext already do.

export interface CommunityContextValue {
  isAuthenticated: boolean;
  session: CommunitySession | null;
  profile: CommunityProfile | null;
  canModerate: boolean;
  requireAuth: () => void;
  navigate: (pathname: string) => void;
  openPost: (postId: string) => void;
  openProfile: (handle: string) => void;
  openHashtag: (tag: string) => void;
  openSearch: (query: string, type?: CommunitySearchType) => void;
  openReply: (post: CommunityPost) => void;
  openQuote: (post: CommunityPost) => void;
  openReport: (input: { postId?: string; handle?: string }) => void;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

export function CommunityProvider({ value, children }: { value: CommunityContextValue; children: ReactNode }) {
  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity(): CommunityContextValue {
  const context = useContext(CommunityContext);

  if (!context) {
    throw new Error('useCommunity must be used within a CommunityProvider');
  }

  return context;
}
