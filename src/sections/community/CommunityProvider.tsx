import type { ReactNode } from 'react';
import { CommunityContext, type CommunityContextValue } from './CommunityContext';

export function CommunityProvider({ value, children }: { value: CommunityContextValue; children: ReactNode }) {
  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}
