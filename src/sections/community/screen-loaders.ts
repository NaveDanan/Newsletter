// Shared with post cards so pointer intent can load the thread before a click.
import { lazyComponent } from '@/lib/lazy-component';
export const loadCommunityThread = () => import('./CommunityThreadScreen').then((module) => ({ default: module.CommunityThreadScreen }));
export const CommunityThreadScreen = lazyComponent(loadCommunityThread);
