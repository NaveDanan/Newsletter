import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/contexts/LocaleContext';
import { getPocketBaseErrorMessage, toggleCommunityFollow } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { useCommunity } from './CommunityContext';

// Follow state lives on whatever record the caller is rendering, so the button
// reports the change upward rather than owning it. The optimistic flip reverts
// on failure the same way the engagement hook does.

interface CommunityFollowButtonProps {
  handle: string;
  isFollowing: boolean;
  onChange: (isFollowing: boolean, followerCount: number) => void;
  size?: 'sm' | 'default';
  className?: string;
}

export function CommunityFollowButton({
  handle,
  isFollowing,
  onChange,
  size = 'sm',
  className,
}: CommunityFollowButtonProps) {
  const { t } = useLocale();
  const { isAuthenticated, requireAuth, profile } = useCommunity();
  const [isPending, setIsPending] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Nobody follows themselves, and the hook route rejects it anyway.
  if (profile && profile.handle === handle) {
    return null;
  }

  const submit = async () => {
    if (!isAuthenticated) {
      requireAuth();
      return;
    }
    if (isPending) {
      return;
    }

    setIsPending(true);
    const previous = isFollowing;
    onChange(!previous, -1);

    try {
      const result = await toggleCommunityFollow(handle);
      onChange(result.isFollowing, result.followerCount);
    } catch (caught) {
      onChange(previous, -1);
      toast.error(getPocketBaseErrorMessage(caught, t('community.profile.followFailed')));
    } finally {
      setIsPending(false);
    }
  };

  // Following turns into "Unfollow" on hover, so the destructive action is
  // never a surprise but also never the resting label.
  const label = isFollowing
    ? t(isHovering ? 'community.profile.unfollow' : 'community.profile.following')
    : t('community.profile.follow');

  return (
    <Button
      type="button"
      size={size}
      disabled={isPending}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onFocus={() => setIsHovering(true)}
      onBlur={() => setIsHovering(false)}
      className={cn(
        'rounded-full px-4 font-semibold',
        isFollowing
          ? 'border border-[#E5E5E5] bg-white text-[#171717] hover:border-[#D93A3A]/40 hover:bg-[#D93A3A]/10 hover:text-[#D93A3A]'
          : 'bg-[#171717] text-white hover:bg-[#171717]/90',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        void submit();
      }}
    >
      {label}
    </Button>
  );
}
