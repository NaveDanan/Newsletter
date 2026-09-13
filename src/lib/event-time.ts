import type { NewsletterEvent } from '@/types/newsletter';

/** Store instants so the scheduler and attendees agree across timezones. */
export function eventWithUtcDates(event: NewsletterEvent): NewsletterEvent {
  const iso = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : value;
  };
  return { ...event, startDate: iso(event.startDate), endDate: event.endDate ? iso(event.endDate) : undefined };
}

/** datetime-local expects a local wall time, not the leading digits of UTC. */
export function eventDateTimeInput(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
