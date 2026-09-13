import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolveCommunityFileUrl } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';

interface CommunityAvatarProps {
  handle: string;
  displayName: string;
  avatarUrl: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  onClick?: () => void;
}

const SIZE_CLASS: Record<'sm' | 'md' | 'lg' | 'xl' | '2xl', string> = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-12',
  xl: 'size-24 border-4 border-white',
  '2xl': 'size-28 sm:size-36 border-4 border-white shadow-sm ring-1 ring-black/5',
};

// Falls back to the first letter of the display name, then of the handle. A
// removed post carries no author at all, in which case the caller passes empty
// strings and gets a neutral placeholder.
function initialsOf(displayName: string, handle: string): string {
  const source = displayName.trim() || handle.trim();
  if (!source) {
    return 'U';
  }
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return Array.from(source)[0].toUpperCase();
}

export function CommunityAvatar({
  handle,
  displayName,
  avatarUrl,
  size = 'md',
  className,
  onClick,
}: CommunityAvatarProps) {
  const avatar = (
    <Avatar className={cn(SIZE_CLASS[size], 'shrink-0 border border-[#E5E5E5] bg-[#F5F5F5]', className)}>
      <AvatarImage
        src={resolveCommunityFileUrl(avatarUrl)}
        alt={displayName || handle || 'Avatar'}
        className="object-cover"
      />
      <AvatarFallback className={cn("bg-gradient-to-br from-[#D93A3A] to-[#B91C1C] font-semibold text-white", size === '2xl' ? 'text-3xl sm:text-4xl' : size === 'xl' ? 'text-xl' : 'text-sm')}>
        {initialsOf(displayName, handle)}
      </AvatarFallback>
    </Avatar>
  );

  if (!onClick) {
    return avatar;
  }

  return (
    <button
      type="button"
      className="shrink-0 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93A3A]"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {avatar}
    </button>
  );
}
