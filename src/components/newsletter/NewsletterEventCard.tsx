import { useState, useRef, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  Calendar01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Download01Icon,
  GlobeIcon,
  Link01Icon,
  Loading02Icon,
  UserGroupIcon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import {
  downloadIcsFile,
  getGoogleCalendarUrl,
  getOutlookCalendarUrl,
} from '@/lib/calendar-export';
import { cn } from '@/lib/utils';
import type { PocketBaseUser } from '@/lib/pocketbase/client';
import type { NewsletterEvent } from '@/types/newsletter';

interface NewsletterEventCardProps {
  event: NewsletterEvent;
  newsletterId: string;
  currentUser?: PocketBaseUser | null;
  onRsvp?: (newsletterId: string) => void | Promise<unknown>;
  onRequireAuth?: () => void;
  isInteractive?: boolean;
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function NewsletterEventCard({
  event,
  newsletterId,
  currentUser = null,
  onRsvp,
  onRequireAuth,
  isInteractive = true,
  className,
}: NewsletterEventCardProps) {
  const { formatDate, formatNumber, isRTL, t } = useLocale();
  const [isCalendarMenuOpen, setIsCalendarMenuOpen] = useState(false);
  const [isSubmittingRsvp, setIsSubmittingRsvp] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);

  const isAuthenticated = Boolean(currentUser?.id);
  const isAttending = Boolean(
    currentUser?.id && event.attendees.some((a) => a.userId === currentUser.id)
  );

  const attendeeCount = event.attendees.length;

  // Close calendar menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calendarMenuRef.current && !calendarMenuRef.current.contains(e.target as Node)) {
        setIsCalendarMenuOpen(false);
      }
    }
    if (isCalendarMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isCalendarMenuOpen]);

  // Parse start and end dates
  const startDateObj = new Date(event.startDate);
  const isValidDate = !isNaN(startDateObj.getTime());
  const endDateObj = event.endDate ? new Date(event.endDate) : null;
  const isValidEndDate = endDateObj ? !isNaN(endDateObj.getTime()) : false;

  const isLocationUrl = Boolean(
    event.location && /^(https?:\/\/)/i.test(event.location.trim())
  );

  const handleRsvpClick = async () => {
    if (!isInteractive) return;

    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }

    if (!onRsvp) return;

    try {
      setIsSubmittingRsvp(true);
      await onRsvp(newsletterId);
      toast.success(isAttending ? t('viewer.rsvpCancelled') : t('viewer.rsvpSuccess'));
    } catch {
      toast.error('Failed to update attendance');
    } finally {
      setIsSubmittingRsvp(false);
    }
  };

  const handleDownloadIcs = () => {
    downloadIcsFile(event);
    setIsCalendarMenuOpen(false);
    toast.success(t('viewer.calendarDownloaded'));
  };

  const handleOpenGoogleCalendar = () => {
    window.open(getGoogleCalendarUrl(event), '_blank');
    setIsCalendarMenuOpen(false);
  };

  const handleOpenOutlookCalendar = () => {
    window.open(getOutlookCalendarUrl(event), '_blank');
    setIsCalendarMenuOpen(false);
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-[#E5E5E5] bg-gradient-to-br from-white via-[#FAFAFA] to-white p-5 shadow-xs sm:p-6',
        className
      )}
    >
      {/* Top Banner / Type label */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-[#D93A3A]">
            <HugeiconsIcon icon={Calendar03Icon} className="h-4.5 w-4.5" />
          </div>
          <span className="text-xs font-semibold tracking-wider uppercase text-[#D93A3A]">
            {t('viewer.upcomingEvent')}
          </span>
        </div>

        {/* Calendar dropdown menu */}
        <div className="relative" ref={calendarMenuRef}>
          <button
            type="button"
            onClick={() => setIsCalendarMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs font-medium text-[#171717] shadow-2xs transition-colors hover:border-[#D4D4D4] hover:bg-[#F5F5F5]"
          >
            <HugeiconsIcon icon={Calendar01Icon} className="h-3.5 w-3.5 text-[#737373]" />
            <span>{t('viewer.addToCalendar')}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} className="h-3 w-3 text-[#A3A3A3]" />
          </button>

          {isCalendarMenuOpen && (
            <div
              className={cn(
                'absolute z-20 mt-1.5 w-52 rounded-xl border border-[#E5E5E5] bg-white p-1.5 shadow-lg',
                isRTL ? 'left-0' : 'right-0'
              )}
            >
              <button
                type="button"
                onClick={handleOpenGoogleCalendar}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#171717] hover:bg-[#F5F5F5]"
              >
                <HugeiconsIcon icon={Calendar01Icon} className="h-4 w-4 text-blue-600" />
                <span>{t('viewer.googleCalendar')}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenOutlookCalendar}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#171717] hover:bg-[#F5F5F5]"
              >
                <HugeiconsIcon icon={Calendar03Icon} className="h-4 w-4 text-sky-600" />
                <span>{t('viewer.outlookCalendar')}</span>
              </button>
              <div className="my-1 border-t border-[#E5E5E5]" />
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#171717] hover:bg-[#F5F5F5]"
              >
                <HugeiconsIcon icon={Download01Icon} className="h-4 w-4 text-neutral-600" />
                <span>{t('viewer.downloadIcs')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main card body with Date badge + Info */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Date Badge */}
        {isValidDate && (
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:justify-center sm:rounded-xl sm:border sm:border-[#E5E5E5] sm:bg-white sm:px-4 sm:py-3.5 sm:text-center sm:shadow-2xs">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[#D93A3A] text-white shadow-2xs sm:h-auto sm:w-auto sm:bg-transparent sm:text-inherit sm:shadow-none">
              <span className="text-[10px] font-bold tracking-widest uppercase text-white/90 sm:text-xs sm:text-[#D93A3A]">
                {formatDate(startDateObj, { month: 'short' })}
              </span>
              <span className="text-xl font-extrabold sm:text-3xl sm:font-black sm:text-[#171717]">
                {formatDate(startDateObj, { day: 'numeric' })}
              </span>
            </div>
            <div className="sm:hidden">
              <div className="font-semibold text-[#171717]">
                {formatDate(startDateObj, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="text-xs text-[#737373]">
                {formatDate(startDateObj, { hour: '2-digit', minute: '2-digit' })}
                {isValidEndDate && ` - ${formatDate(endDateObj!, { hour: '2-digit', minute: '2-digit' })}`}
              </div>
            </div>
          </div>
        )}

        {/* Event details */}
        <div className="flex-1 space-y-2.5">
          <h3 className="text-lg font-bold text-[#171717] sm:text-xl" dir="auto">
            {event.title}
          </h3>

          {/* Time & Date (desktop) */}
          {isValidDate && (
            <div className="hidden items-center gap-2 text-xs font-medium text-[#737373] sm:flex">
              <HugeiconsIcon icon={Clock01Icon} className="h-3.5 w-3.5 text-[#A3A3A3]" />
              <span>
                {formatDate(startDateObj, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {' · '}
                {formatDate(startDateObj, { hour: '2-digit', minute: '2-digit' })}
                {isValidEndDate && ` - ${formatDate(endDateObj!, { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-2 text-xs font-medium text-[#737373]">
              <HugeiconsIcon icon={isLocationUrl ? Link01Icon : GlobeIcon} className="h-3.5 w-3.5 text-[#A3A3A3]" />
              {isLocationUrl ? (
                <a
                  href={event.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#D93A3A] underline-offset-2 hover:underline"
                >
                  <span>{event.location.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>
                </a>
              ) : (
                <span dir="auto">{event.location}</span>
              )}
            </div>
          )}

          {/* Description */}
          {event.description && (
            <p className="text-sm leading-relaxed text-[#525252]" dir="auto">
              {event.description}
            </p>
          )}
        </div>
      </div>

      {/* Attendees and RSVP Bar */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E5E5] pt-4">
        {/* Attendees preview */}
        <div className="flex items-center gap-2">
          {attendeeCount > 0 ? (
            <div className="flex items-center -space-x-2 rtl:space-x-reverse">
              {event.attendees.slice(0, 4).map((attendee, idx) => (
                <div
                  key={attendee.userId || idx}
                  className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#E5E5E5] text-[10px] font-bold text-[#525252] shadow-2xs"
                  title={attendee.name}
                >
                  {attendee.avatar ? (
                    <img src={attendee.avatar} alt={attendee.name} className="h-full w-full object-cover" />
                  ) : (
                    <span>{getInitials(attendee.name)}</span>
                  )}
                </div>
              ))}
              {attendeeCount > 4 && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-neutral-800 text-[10px] font-semibold text-white shadow-2xs">
                  +{attendeeCount - 4}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-[#737373]">
              <HugeiconsIcon icon={UserGroupIcon} className="h-4 w-4" />
            </div>
          )}

          <span className="text-xs font-medium text-[#737373]">
            {attendeeCount === 0
              ? t('viewer.noAttendeesYet')
              : attendeeCount === 1
              ? t('viewer.oneAttendee')
              : t('viewer.attendeeCount', { count: formatNumber(attendeeCount) })}
          </span>
        </div>

        {/* RSVP button */}
        <div>
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={onRequireAuth}
              className="flex items-center gap-1.5 rounded-xl border border-[#D93A3A] bg-white px-4 py-2 text-xs font-semibold text-[#D93A3A] shadow-2xs transition-all hover:bg-[#D93A3A] hover:text-white"
            >
              <HugeiconsIcon icon={UserIcon} className="h-3.5 w-3.5" />
              <span>{t('viewer.signInToAttend')}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!isInteractive || isSubmittingRsvp}
              onClick={handleRsvpClick}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-2xs transition-all disabled:opacity-70',
                isAttending
                  ? 'border border-green-300 bg-green-50 text-green-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700'
                  : 'bg-[#D93A3A] text-white hover:bg-[#B91C1C]'
              )}
            >
              {isSubmittingRsvp ? (
                <HugeiconsIcon icon={Loading02Icon} className="h-3.5 w-3.5 animate-spin" />
              ) : isAttending ? (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-3.5 w-3.5" />
              ) : (
                <HugeiconsIcon icon={Calendar01Icon} className="h-3.5 w-3.5" />
              )}
              <span>{isAttending ? t('viewer.attending') : t('viewer.attend')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
