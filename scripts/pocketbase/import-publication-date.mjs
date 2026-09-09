// Store the source calendar date, matching the date-only field used by the article UI.
export function sourcePublicationDate(text) {
  const match = String(text || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').match(/^\s*(?:פורסם|Published)\s*:\s*(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?)?\s*$/iu);
  if (!match) return '';
  const date = new Date(`${match[1]}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : '';
}

export function repairImportedPublicationDate(content) {
  // Old imports put this metadata in their first paragraph. Match only that location
  // so an article that quotes a publication date in its prose is left intact.
  const match = String(content || '').match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (!match || /<(?:img|video|iframe)\b/i.test(match[1])) return null;
  const text = match[1].replace(/<[^>]*>/g, '').replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
    const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return value <= 0x10ffff ? String.fromCodePoint(value) : '';
  }).replace(/&nbsp;/gi, ' ');
  const publishedAt = sourcePublicationDate(text);
  return publishedAt ? { publishedAt, content: content.slice(match[0].length) } : null;
}
