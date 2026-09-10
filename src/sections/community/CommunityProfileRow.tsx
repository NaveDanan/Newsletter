import { CommunityAvatar } from './CommunityAvatar';
import { useCommunity } from './CommunityContext';
import { CommunityFollowButton } from './CommunityFollowButton';
import { cn } from '@/lib/utils';
import type { CommunityProfile } from '@/types/community';

// The compact person row used by the people search tab, the follower and
// following lists, and the who-to-follow rail.

interface CommunityProfileRowProps {
  profile: CommunityProfile;
  onFollowChange: (handle: string, isFollowing: boolean, followerCount: number) => void;
  showBio?: boolean;
  className?: string;
}

export function CommunityProfileRow({
  profile,
  onFollowChange,
  showBio = true,
  className,
}: CommunityProfileRowProps) {
  const { openProfile } = useCommunity();

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-[#FAFAFA]',
        className,
      )}
      onClick={() => openProfile(profile.handle)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openProfile(profile.handle);
        }
      }}
    >
      <CommunityAvatar
        handle={profile.handle}
        displayName={profile.displayName}
        avatarUrl={profile.avatarUrl}
        onClick={() => openProfile(profile.handle)}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-[#171717]">
          {profile.displayName || profile.handle}
        </p>
        <p className="truncate text-sm text-[#737373]">@{profile.handle}</p>
        {showBio && profile.bio ? (
          <p className="mt-1 line-clamp-2 text-sm text-[#404040]">{profile.bio}</p>
        ) : null}
      </div>

      <CommunityFollowButton
        handle={profile.handle}
        isFollowing={profile.isFollowing}
        onChange={(isFollowing, followerCount) => onFollowChange(profile.handle, isFollowing, followerCount)}
      />
    </div>
  );
}
