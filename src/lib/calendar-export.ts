import type { NewsletterEvent } from '@/types/newsletter';

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function generateIcsContent(event: NewsletterEvent): string {
  const startDate = new Date(event.startDate);
  const isValidStart = !isNaN(startDate.getTime());
  const effectiveStart = isValidStart ? startDate : new Date();

  let effectiveEnd: Date;
  if (event.endDate) {
    const end = new Date(event.endDate);
    effectiveEnd = !isNaN(end.getTime()) ? end : new Date(effectiveStart.getTime() + 60 * 60 * 1000);
  } else {
    effectiveEnd = new Date(effectiveStart.getTime() + 60 * 60 * 1000); // 1 hour default
  }

  const now = new Date();
  const uid = `${event.id || 'event'}-${now.getTime()}@newsletter.local`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pulse Newsletter//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(effectiveStart)}`,
    `DTEND:${formatIcsDate(effectiveEnd)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : '',
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function downloadIcsFile(event: NewsletterEvent): void {
  const icsContent = generateIcsContent(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeFilename = event.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'event';
  link.setAttribute('download', `${safeFilename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getGoogleCalendarUrl(event: NewsletterEvent): string {
  const startDate = new Date(event.startDate);
  const isValidStart = !isNaN(startDate.getTime());
  const effectiveStart = isValidStart ? startDate : new Date();

  let effectiveEnd: Date;
  if (event.endDate) {
    const end = new Date(event.endDate);
    effectiveEnd = !isNaN(end.getTime()) ? end : new Date(effectiveStart.getTime() + 60 * 60 * 1000);
  } else {
    effectiveEnd = new Date(effectiveStart.getTime() + 60 * 60 * 1000);
  }

  const startIso = formatIcsDate(effectiveStart);
  const endIso = formatIcsDate(effectiveEnd);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${startIso}/${endIso}`,
    details: event.description || '',
    location: event.location || '',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function getOutlookCalendarUrl(event: NewsletterEvent): string {
  const startDate = new Date(event.startDate);
  const isValidStart = !isNaN(startDate.getTime());
  const effectiveStart = isValidStart ? startDate : new Date();

  let effectiveEnd: Date;
  if (event.endDate) {
    const end = new Date(event.endDate);
    effectiveEnd = !isNaN(end.getTime()) ? end : new Date(effectiveStart.getTime() + 60 * 60 * 1000);
  } else {
    effectiveEnd = new Date(effectiveStart.getTime() + 60 * 60 * 1000);
  }

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: effectiveStart.toISOString(),
    enddt: effectiveEnd.toISOString(),
    body: event.description || '',
    location: event.location || '',
  });

  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}
