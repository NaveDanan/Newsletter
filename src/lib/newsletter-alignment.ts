import type { NewsletterTextAlignment } from '../types/newsletter';

const STYLE_ALIGNMENT_PATTERN = /text-align\s*:\s*(left|center|right|justify)\b/gi;
const DIR_PATTERN = /\bdir\s*=\s*["']?(rtl|ltr)\b/gi;
const RTL_CHARACTER_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

export function normalizeNewsletterTextAlignment(value: unknown): NewsletterTextAlignment | null {
  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }

  return null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferDirectionalAlignment(html: string): NewsletterTextAlignment {
  const directionMatches = Array.from(html.matchAll(DIR_PATTERN));
  const lastDirection = directionMatches.at(-1)?.[1]?.toLowerCase();

  if (lastDirection === 'rtl') {
    return 'right';
  }

  if (lastDirection === 'ltr') {
    return 'left';
  }

  return RTL_CHARACTER_PATTERN.test(stripHtml(html)) ? 'right' : 'left';
}

export function inferNewsletterTextAlignment(html: string): NewsletterTextAlignment {
  const counts: Record<NewsletterTextAlignment, number> = {
    left: 0,
    center: 0,
    right: 0,
  };

  for (const match of html.matchAll(STYLE_ALIGNMENT_PATTERN)) {
    const alignment = match[1]?.toLowerCase();

    if (alignment === 'left' || alignment === 'center' || alignment === 'right') {
      counts[alignment] += 1;
    }
  }

  const highestCount = Math.max(counts.left, counts.center, counts.right);

  if (highestCount > 0) {
    if (counts.center === highestCount && counts.center > counts.left && counts.center > counts.right) {
      return 'center';
    }

    if (counts.right === highestCount && counts.right > counts.left) {
      return 'right';
    }

    if (counts.left === highestCount && counts.left > counts.right) {
      return 'left';
    }
  }

  return inferDirectionalAlignment(html);
}