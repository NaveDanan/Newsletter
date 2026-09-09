import { DOMParser } from '@xmldom/xmldom';

function paragraphText(html) {
  if (/<!DOCTYPE|<!ENTITY|<(?:img|video|iframe)\b/i.test(html)) return '';
  try { return new DOMParser({ onError: () => { throw new Error('Invalid paragraph'); } }).parseFromString(html, 'application/xml').documentElement.textContent.trim(); }
  catch { return ''; }
}

// Repair only the exact HTML pattern emitted by older DOCX imports.
export function repairImportedLayout(article) {
  const patch = {};
  let content = String(article.content || '').replace(/dir="rtl" style="text-align:left"/g, 'dir="rtl" style="text-align:right"');
  if (article.textAlignment === 'left' && /[\u0590-\u05ff]/.test(article.title || '')) patch.textAlignment = 'right';
  if (!article.subtitle) {
    const first = content.match(/^\s*(<p\b[^>]*>[\s\S]*?<\/p>)\s*(?=<p\b)/i);
    const rest = first ? content.slice(first[0].length) : '';
    const next = rest.match(/^<p\b[^>]*>[\s\S]*?<\/p>/i);
    const text = first ? paragraphText(first[1]) : '';
    if (text && next && /^(?:מאת\s*:?\s+|By\s+|כתובת כתבה:)/i.test(paragraphText(next[0]))
      && !/^(?:מאת\s*:?\s+|By\s+|כתובת כתבה:|פורסם:)/i.test(text)) {
      patch.subtitle = text;
      content = rest;
    }
  }
  if (content !== article.content) patch.content = content;
  return Object.keys(patch).length ? patch : null;
}
