import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { useLocale } from '@/contexts/LocaleContext';
import type { CommunityNotification } from '@/types/community';

export function NotificationVisual({ notification, actors = [] }: { notification: CommunityNotification; actors?: CommunityNotification[] }) {
  const { formatNumber } = useLocale();
  if (notification.kind === 'newsletter') {
    return <div className="w-[68px] shrink-0"><img src={notification.newsletterCoverUrl || '/logo.gif'} alt={notification.preview} width={48} height={48} loading="lazy" decoding="async" onError={event => { if (!event.currentTarget.src.endsWith('/logo.gif')) event.currentTarget.src = '/logo.gif'; }} className="size-12 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-pill)] object-cover" /></div>;
  }
  const people = actors.length ? actors : notification.actorId ? [notification] : [];
  const extra = Math.max(0, people.length - 3);
  return (
    <div className="flex min-w-[48px] shrink-0 items-center" data-notification-avatars aria-hidden="true">
      {people.slice(0, 3).map((actor, index) => <span key={actor.actorId} className="relative flex shrink-0" style={{ marginInlineStart: index ? -12 : 0 }}><UserAvatarCircle name={actor.actorName || actor.actorHandle} src={actor.actorAvatarUrl} size={36} className="ring-2 ring-white" /></span>)}
      {extra ? <span data-avatar-overflow className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d1d5db] text-xs font-semibold text-[#56606c] ring-2 ring-white" style={{ marginInlineStart: -12 }} dir="ltr">+{formatNumber(extra)}</span> : null}
      {!people.length ? <img src="/logo.gif" alt="" width={36} height={36} className="size-9 rounded-full object-cover" /> : null}
    </div>
  );
}
