import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarCircleProps {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}

/**
 * The signed-in user's avatar: their uploaded picture when they have one,
 * their initials otherwise. Always a circle — the uploaded image is stored
 * pre-cropped to a square, so `object-cover` never distorts it.
 */
export function UserAvatarCircle({
  name,
  email,
  src,
  size = 32,
  className,
}: UserAvatarCircleProps) {
  const label = name || email || null;

  return (
    <Avatar
      style={{ width: size, height: size }}
      className={cn('shrink-0 border border-[#E5E5E5] bg-[#F3F4F6]', className)}
    >
      <AvatarImage src={src ?? undefined} alt={label ?? ''} className="object-cover" />
      <AvatarFallback className="bg-gradient-to-br from-[#D93A3A] to-[#B91C1C] font-bold leading-none text-white">
        <span style={{ fontSize: Math.max(9, Math.round(size * 0.4)) }}>{initials(label)}</span>
      </AvatarFallback>
    </Avatar>
  );
}
