import { escapeCommunityBodyLiteral, splitCommunityBody } from './community-text';

export const COMMENT_EMOJIS = ['😀', '😂', '😍', '🔥', '👏', '🎉', '👍', '❤️', '🚀', '🙌'] as const;

const HTML_TAG_PATTERN = /<[^>]+>/g;
const HTML_ENTITY_PATTERN = /&nbsp;/g;
const ALLOWED_TAGS = new Set(['br', 'p', 'strong', 'em', 'u', 's']);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function legacyMarkupToHtml(value: string): string {
  const tags = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' };
  let active: Array<keyof typeof tags> = [];
  let html = '';
  for (const segment of splitCommunityBody(value, [])) {
    let shared = 0;
    while (shared < active.length && active[shared] === segment.marks[shared]) shared += 1;
    for (let index = active.length - 1; index >= shared; index -= 1) html += `</${tags[active[index]]}>`;
    for (let index = shared; index < segment.marks.length; index += 1) html += `<${tags[segment.marks[index]]}>`;
    html += escapeHtml(segment.text).replace(/\n/g, '<br />');
    active = segment.marks;
  }
  for (let index = active.length - 1; index >= 0; index -= 1) html += `</${tags[active[index]]}>`;
  return html;
}

function hasHtmlMarkup(value: string): boolean {
  const tags = /<\/?[a-z][\s\S]*?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(value)) !== null) {
    let escapes = 0;
    for (let index = match.index - 1; index >= 0 && value[index] === '\\'; index -= 1) escapes += 1;
    if (escapes % 2 === 0) return true;
  }
  return false;
}

function sanitizeHtmlNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map(sanitizeHtmlNode).join('');

  if (!ALLOWED_TAGS.has(tagName)) {
    return children;
  }

  if (tagName === 'br') {
    return '<br />';
  }

  return `<${tagName}>${children}</${tagName}>`;
}

function sanitizeHtml(value: string): string {
  if (typeof window === 'undefined') {
    return value;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(value, 'text/html');

  return Array.from(document.body.childNodes).map(sanitizeHtmlNode).join('');
}

export function stripCommentFormatting(value: string): string {
  const withLegacyMarkersRemoved = splitCommunityBody(value, []).map((segment) => segment.text).join('');
  if (!hasHtmlMarkup(value)) return withLegacyMarkersRemoved.trim();

  return withLegacyMarkersRemoved
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(HTML_TAG_PATTERN, '')
    .replace(HTML_ENTITY_PATTERN, ' ')
    .trim();
}

export function formatCommentBodyToHtml(value: string): string {
  if (!value) {
    return '';
  }

  if (hasHtmlMarkup(value)) {
    return sanitizeHtml(value);
  }

  return legacyMarkupToHtml(value);
}

// Community posts always store plain markup, even when their literal text
// resembles an HTML tag. The editor must rehydrate it without HTML detection.
export function formatCommunityBodyToHtml(value: string): string {
  return legacyMarkupToHtml(value);
}

const MARKUP_TAGS: Record<string, string> = {
  strong: '**',
  b: '**',
  em: '*',
  i: '*',
  u: '++',
  s: '~~',
  strike: '~~',
  del: '~~',
};

function nodeToMarkup(node: ChildNode, output: { markup: string; visible: string }): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    output.markup += escapeCommunityBodyLiteral(text);
    output.visible += text;
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'br') {
    output.markup += '\n';
    output.visible += '\n';
    return;
  }

  const marker = (element.textContent ?? '').trim() ? MARKUP_TAGS[tagName] : undefined;
  if (marker) {
    // A raw URL can legally contain paired stars. Distinguish an editor mark
    // starting inside that URL, while literal stars are backslash-escaped.
    const insideUrl = /\bhttps?:\/\/[^\s<>"']*$/i.test(output.visible);
    const multilineItalic = marker === '*' && (element.getElementsByTagName('br').length > 0 || /[\r\n]/.test(element.textContent ?? ''));
    output.markup += (insideUrl || multilineItalic ? '\\!' : '') + marker;
  }
  Array.from(element.childNodes).forEach((child) => nodeToMarkup(child, output));
  if (marker) output.markup += marker;
  if (tagName === 'p' || tagName === 'div') {
    output.markup += '\n';
    output.visible += '\n';
  }
}

// The inverse of legacyMarkupToHtml: a rich-text editor can drive a field that
// is stored, searched and entity-scanned as plain text.
export function htmlToCommentMarkup(value: string): string {
  if (!value || typeof window === 'undefined') {
    return value;
  }

  const document = new DOMParser().parseFromString(value, 'text/html');
  const output = { markup: '', visible: '' };
  Array.from(document.body.childNodes).forEach((node) => nodeToMarkup(node, output));
  return output.markup
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '');
}
