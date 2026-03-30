export const COMMENT_EMOJIS = ['😀', '😂', '😍', '🔥', '👏', '🎉', '👍', '❤️', '🚀', '🙌'] as const;

const BOLD_PATTERN = /\*\*([\s\S]+?)\*\*/g;
const ITALIC_PATTERN = /(^|[^*])\*([^*\n]+)\*(?!\*)/g;
const UNDERLINE_PATTERN = /\+\+([\s\S]+?)\+\+/g;
const STRIKE_PATTERN = /~~([\s\S]+?)~~/g;
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
  return escapeHtml(value)
    .replace(BOLD_PATTERN, '<strong>$1</strong>')
    .replace(ITALIC_PATTERN, '$1<em>$2</em>')
    .replace(UNDERLINE_PATTERN, '<u>$1</u>')
    .replace(STRIKE_PATTERN, '<s>$1</s>')
    .replace(/\n/g, '<br />');
}

function hasHtmlMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
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
  const withLegacyMarkersRemoved = value
    .replace(BOLD_PATTERN, '$1')
    .replace(ITALIC_PATTERN, '$1$2')
    .replace(UNDERLINE_PATTERN, '$1')
    .replace(STRIKE_PATTERN, '$1');

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
