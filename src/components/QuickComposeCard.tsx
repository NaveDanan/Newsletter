import { useRef, type ChangeEvent } from 'react';
import { BarChart2, Calendar, Image, Video } from 'lucide-react';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { useLocale } from '@/contexts/LocaleContext';

interface QuickComposeCardProps {
  user?: { name?: string | null; email?: string | null; avatar?: string | null } | null;
  /** Files arrive when the reader picked attachments before the composer existed. */
  onCompose: (files?: File[]) => void;
}

/** Compact entry point to the community composer, shown above the home feed and the community feed. */
export function QuickComposeCard({ user, onCompose }: QuickComposeCardProps) {
  const { t } = useLocale();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const actions = [
    { key: 'image', icon: Image, color: 'text-emerald-500', label: t('quickCompose.image'), onClick: () => imageInputRef.current?.click() },
    { key: 'video', icon: Video, color: 'text-blue-500', label: t('quickCompose.video'), onClick: () => videoInputRef.current?.click() },
    { key: 'poll', icon: BarChart2, color: 'text-rose-500', label: t('quickCompose.poll'), onClick: () => onCompose() },
    { key: 'schedule', icon: Calendar, color: 'text-amber-500', label: t('quickCompose.schedule'), onClick: () => onCompose() },
  ];

  const handlePicked = (pickEvent: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(pickEvent.target.files ?? []);
    pickEvent.target.value = '';
    if (files.length > 0) {
      onCompose(files);
    }
  };

  return (
    <div className="create-post-card">
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePicked} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handlePicked} />

      <div className="create-post-top-row flex items-center gap-3">
        <div className="user-mini-avatar shrink-0">
          <UserAvatarCircle name={user?.name} email={user?.email} src={user?.avatar} size={36} />
        </div>
        <div
          className="create-input-pill flex-1 text-xs sm:text-sm text-[var(--text-secondary)]"
          onClick={() => onCompose()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onCompose();
            }
          }}
          role="button"
          tabIndex={0}
        >
          {t('community.composer.placeholder')}
        </div>
      </div>

      <div className="create-post-actions-row flex items-center gap-3 pt-1">
        {actions.map(({ key, icon: Icon, color, label, onClick }) => (
          <button
            key={key}
            type="button"
            className="create-action-btn flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={onClick}
          >
            <Icon className={`size-[18px] ${color}`} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
