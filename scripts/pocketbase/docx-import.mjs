import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import path from 'node:path';
import { sourcePublicationDate } from './import-publication-date.mjs';
import { importImage } from './import-image.mjs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const children = (node) => Array.from(node?.childNodes || []).filter((n) => n.nodeType === 1);
const child = (node, name) => children(node).find((n) => n.localName === name);
const all = (node, name) => Array.from(node?.getElementsByTagNameNS('*', name) || []);
const attr = (node, name = 'val') => node?.getAttributeNS(W, name) || node?.getAttribute(name) || '';
const val = (node, name) => attr(child(node, name));
const escape = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enabled = (node) => node && !['0', 'false', 'off', 'none'].includes(attr(node));
const hebrew = (s) => /[\u0590-\u05ff]/.test(s);

function xml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('DOCX contains unsupported XML declarations.');
  return new DOMParser({ onError: () => { throw new Error('DOCX contains invalid XML.'); } }).parseFromString(text, 'application/xml');
}

// Read OOXML directly so Word paragraph direction and alignment survive conversion.
export async function parseDocx(buffer, filename = 'Newsletter.docx') {
  if (buffer.length > 20 * 1024 * 1024) throw new Error('DOCX exceeds the 20 MB limit.');
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 3000 || entries.reduce((n, f) => n + (f._data?.uncompressedSize || 0), 0) > 80 * 1024 * 1024) {
    throw new Error('DOCX expands beyond the supported size.');
  }
  const read = async (name) => zip.file(name) ? xml(await zip.file(name).async('string')) : null;
  const [document, stylesXml, relsXml, numberingXml] = await Promise.all([
    read('word/document.xml'), read('word/styles.xml'), read('word/_rels/document.xml.rels'), read('word/numbering.xml'),
  ]);
  if (!document) throw new Error('The file is not a Word DOCX document.');
  const styles = new Map(all(stylesXml, 'style').map((s) => [attr(s, 'styleId'), s]));
  const defaultStyle = all(stylesXml, 'style').find((s) => attr(s, 'type') === 'paragraph' && attr(s, 'default') === '1');
  const defaults = all(stylesXml, 'docDefaults')[0];
  const relationships = new Map(all(relsXml, 'Relationship').map((r) => [r.getAttribute('Id'), r]));
  const images = new Map();
  for (const [id, rel] of relationships) {
    if (!(rel.getAttribute('Type') || '').endsWith('/image') || rel.getAttribute('TargetMode') === 'External') continue;
    const target = path.posix.normalize(path.posix.join('word', rel.getAttribute('Target')));
    if (!target.startsWith('word/') || !zip.file(target)) throw new Error(`DOCX image ${target} is missing. Embed the image in Word again.`);
    images.set(id, await importImage(await zip.file(target).async('nodebuffer'), target));
  }
  function styleChain(id, seen = new Set()) {
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const style = styles.get(id);
    return style ? [...styleChain(val(style, 'basedOn'), seen), style] : [];
  }
  function properties(nodes) {
    const props = {};
    for (const node of nodes) for (const prop of children(node)) props[prop.localName] = prop;
    return props;
  }
  function paragraphInfo(p) {
    const direct = child(p, 'pPr');
    const chain = styleChain(val(direct, 'pStyle') || attr(defaultStyle, 'styleId'));
    const props = properties([child(child(defaults, 'pPrDefault'), 'pPr'), ...chain.map((s) => child(s, 'pPr')), direct]);
    const text = all(p, 't').map((n) => n.textContent).join('');
    const rtl = props.bidi ? enabled(props.bidi) : hebrew(text);
    const alignment = { both: 'justify', start: rtl ? 'right' : 'left', end: rtl ? 'left' : 'right' }[attr(props.jc)] || attr(props.jc);
    const align = rtl && alignment === 'left' ? 'right' : ['left', 'right', 'center', 'justify'].includes(alignment) ? alignment : rtl ? 'right' : 'left';
    const names = chain.flatMap((s) => [attr(s, 'styleId'), val(s, 'name')]);
    const title = names.some((name) => /^title$/i.test(name));
    const subtitle = names.some((name) => /^sub\s*title$/i.test(name));
    const headingName = names.map((name) => name.match(/^heading\s*([1-6])$/i)).filter(Boolean).at(-1);
    const outline = props.outlineLvl ? Number(attr(props.outlineLvl)) + 1 : 0;
    const heading = headingName ? Number(headingName[1]) : outline >= 1 && outline <= 6 ? outline : 0;
    return { props, chain, text, rtl, align, title, subtitle, heading };
  }
  function renderInline(node, baseProps = []) {
    if (node.localName === 'del' || node.localName === 'instrText') return '';
    if (node.localName === 't') return escape(node.textContent);
    if (node.localName === 'tab') return '&#9;';
    if (node.localName === 'br' || node.localName === 'cr') return '<br>';
    if (node.localName === 'drawing' || node.localName === 'pict') {
      const blip = all(node, 'blip')[0] || all(node, 'imagedata')[0];
      const id = blip?.getAttributeNS(R, 'embed') || blip?.getAttributeNS(R, 'id');
      if (!id || !images.has(id)) throw new Error('DOCX contains an image that cannot be imported. Embed the image in Word first.');
      const description = all(node, 'docPr')[0];
      const extent = all(node, 'extent')[0];
      const width = Math.min(1600, Math.max(1, Math.round(Number(extent?.getAttribute('cx')) / 9525))) || 0;
      return `<img src="${images.get(id)}" alt="${escape(description?.getAttribute('descr') || description?.getAttribute('name') || '')}"${width ? ` width="${width}"` : ''} style="max-width:100%;height:auto">`;
    }
    if (node.localName === 'hyperlink') {
      const rel = relationships.get(node.getAttributeNS(R, 'id'));
      const href = rel?.getAttribute('Target') || '';
      const content = children(node).map((c) => renderInline(c, baseProps)).join('');
      return /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${escape(href)}" rel="noopener noreferrer">${content}</a>` : content;
    }
    let content = children(node).filter((c) => !['rPr', 'pPr'].includes(c.localName)).map((c) => renderInline(c, baseProps)).join('');
    if (node.localName !== 'r') return content;
    const direct = child(node, 'rPr');
    const props = properties([...baseProps, ...styleChain(val(direct, 'rStyle')).map((s) => child(s, 'rPr')), direct]);
    for (const [name, tag] of [['b', 'strong'], ['i', 'em'], ['u', 'u'], ['strike', 's']]) {
      if (enabled(props[name] || props[`${name}Cs`])) content = `<${tag}>${content}</${tag}>`;
    }
    if (attr(props.vertAlign) === 'superscript') content = `<sup>${content}</sup>`;
    if (attr(props.vertAlign) === 'subscript') content = `<sub>${content}</sub>`;
    const css = [];
    if (/^[a-f\d]{6}$/i.test(attr(props.color))) css.push(`color:#${attr(props.color)}`);
    const size = Number(attr(props.sz || props.szCs));
    if (size >= 2 && size <= 300) css.push(`font-size:${size / 2}pt`);
    const font = attr(props.rFonts, 'ascii') || attr(props.rFonts, 'cs');
    if (font && /^[\p{L}\p{N} ,_-]+$/u.test(font)) css.push(`font-family:${escape(font)}`);
    if (props.rtl) css.push(`direction:${enabled(props.rtl) ? 'rtl' : 'ltr'}`);
    return css.length ? `<span style="${css.join(';')}">${content}</span>` : content;
  }
  function renderParagraph(p) {
    const info = paragraphInfo(p);
    const base = [child(child(defaults, 'rPrDefault'), 'rPr'), ...info.chain.map((s) => child(s, 'rPr'))];
    const tag = info.title ? 'h1' : info.heading ? `h${info.heading}` : 'p';
    const html = `<${tag} dir="${info.rtl ? 'rtl' : 'ltr'}" style="text-align:${info.align}">${renderInline(p, base)}</${tag}>`;
    const num = info.props.numPr;
    const numId = val(num, 'numId');
    if (!numId || numId === '0') return { html, info };
    const number = all(numberingXml, 'num').find((n) => attr(n, 'numId') === numId);
    const abstractId = val(number, 'abstractNumId');
    const abstract = all(numberingXml, 'abstractNum').find((n) => attr(n, 'abstractNumId') === abstractId);
    const level = children(abstract).find((n) => n.localName === 'lvl' && attr(n, 'ilvl') === (val(num, 'ilvl') || '0'));
    const override = children(number).find((n) => n.localName === 'lvlOverride' && attr(n, 'ilvl') === (val(num, 'ilvl') || '0'));
    return { html, info, list: { id: numId, level: Number(val(num, 'ilvl')) || 0, tag: val(level, 'numFmt') === 'bullet' ? 'ul' : 'ol', start: Number(val(override, 'startOverride') || val(level, 'start')) || 1 } };
  }
  function renderBlocks(nodes) {
    let html = '';
    const stack = [];
    const close = () => { const last = stack.pop(); html += `</li></${last.tag}>`; };
    for (const node of nodes) {
      if (node.localName === 'p') {
        const p = renderParagraph(node);
        if (p.list) {
          const depth = Math.min(p.list.level, stack.length);
          while (stack.length > depth + 1) close();
          if (stack.length && (stack.at(-1).id !== p.list.id || stack.at(-1).tag !== p.list.tag)) close();
          if (stack.length <= depth) {
            html += `<${p.list.tag} dir="${p.info.rtl ? 'rtl' : 'ltr'}"${p.list.tag === 'ol' ? ` start="${p.list.start}"` : ''}><li>`;
            stack.push(p.list);
          } else html += '</li><li>';
          html += p.html;
          continue;
        }
      }
      while (stack.length) close();
      if (node.localName === 'p') html += renderParagraph(node).html;
      else if (node.localName === 'tbl') {
        html += `<table style="border-collapse:collapse;width:100%"><tbody>${children(node).filter((n) => n.localName === 'tr').map((row) => `<tr>${children(row).filter((n) => n.localName === 'tc').map((cell) => {
          const span = Number(val(child(cell, 'tcPr'), 'gridSpan')) || 1;
          return `<td colspan="${Math.min(100, Math.max(1, span))}" style="border:1px solid #d4d4d4;padding:8px">${renderBlocks(children(cell))}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table>`;
      } else if (node.localName === 'sdt') html += renderBlocks(children(child(node, 'sdtContent')));
    }
    while (stack.length) close();
    return html;
  }
  const body = all(document, 'body')[0];
  const unwrap = (nodes) => nodes.flatMap((n) => n.localName === 'sdt' ? unwrap(children(child(n, 'sdtContent'))) : [n]);
  const blocks = unwrap(children(body));
  const headings = blocks.filter((n) => n.localName === 'p').map(paragraphInfo);
  const useTitles = headings.filter((i) => i.title && i.text.trim()).length > 1;
  const useHeadings = !useTitles && headings.some((i) => i.heading === 1 && i.text.trim());
  const groups = [];
  let current = [];
  let started = !useTitles && !useHeadings;
  for (const block of blocks) {
    const info = block.localName === 'p' ? paragraphInfo(block) : null;
    const boundary = info?.text.trim() && (useTitles ? info.title : useHeadings ? info.heading === 1 : false);
    if (boundary) started = true;
    if (!started) continue;
    if (boundary && current.some((n) => n.localName === 'p' && (useTitles ? paragraphInfo(n).title : paragraphInfo(n).heading === 1))) {
      groups.push(current); current = [];
    }
    current.push(block);
  }
  if (current.length) groups.push(current);
  const articles = groups.map((nodes, index) => {
    const infos = nodes.filter((n) => n.localName === 'p').map(paragraphInfo);
    const titleInfo = infos.find((i) => i.text.trim() && (useTitles ? i.title : useHeadings ? i.heading === 1 : i.title || i.heading === 1));
    const titleNode = nodes.find((n) => n.localName === 'p' && paragraphInfo(n).text === titleInfo?.text);
    const afterTitle = nodes.slice(nodes.indexOf(titleNode) + 1).filter((n) => n.localName === 'p' && paragraphInfo(n).text.trim());
    const first = afterTitle[0] && paragraphInfo(afterTitle[0]);
    const next = afterTitle[1] && paragraphInfo(afterTitle[1]);
    const isMetadata = (text) => Boolean(sourcePublicationDate(text)) || /^(מאת\s*:?|By\s|כתובת כתבה:)/i.test(text.trim());
    const subtitleNode = first && !first.heading && !first.title && !isMetadata(first.text)
      && (first.subtitle || (titleNode && next && isMetadata(next.text))) ? afterTitle[0] : null;
    const subtitle = subtitleNode ? paragraphInfo(subtitleNode).text.trim() : '';
    const publishedAt = infos.map((info) => sourcePublicationDate(info.text)).find(Boolean) || '';
    const contentNodes = nodes.filter((n) => {
      if (n === titleNode || n === subtitleNode) return false;
      const text = n.localName === 'p' ? paragraphInfo(n).text.trim() : '';
      return !sourcePublicationDate(text) && !/^\{\s*[^{}]+\s*\}$/.test(text) && !/^כתובת תמונה:/.test(text);
    });
    const text = contentNodes.map((n) => all(n, 't').map((t) => t.textContent).join('')).join(' ').trim();
    const html = renderBlocks(contentNodes);
    if (!text && !html.includes('<img')) return null;
    const title = titleInfo?.text.trim() || infos.find((i) => i.text.trim())?.text.trim() || filename.replace(/\.docx$/i, '') + (index ? ` ${index + 1}` : '');
    const rtl = titleInfo?.rtl ?? hebrew(text);
    return {
      title: title.slice(0, 10000), content: html, excerpt: (subtitle || text).slice(0, 300), subtitle,
      publishedAt,
      textAlignment: ['left', 'center', 'right'].includes(titleInfo?.align) ? titleInfo.align : rtl ? 'right' : 'left',
      coverImage: html.match(/<img src="([^"]+)"/)?.[1] || '',
      readTime: `${Math.max(1, Math.ceil(text.split(/\s+/).length / 200))} min`,
      author: infos.find((i) => /^מאת\s*:?\s+/.test(i.text.trim()))?.text.trim().replace(/^מאת\s*:?\s+/, '') || '',
    };
  }).filter(Boolean);
  if (!articles.length) throw new Error('DOCX has no article content.');
  if (articles.length > 100 || Buffer.byteLength(JSON.stringify(articles)) > 25 * 1024 * 1024) throw new Error('Converted DOCX exceeds the article or content limit.');
  return articles;
}
