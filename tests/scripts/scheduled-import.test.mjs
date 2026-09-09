import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { parseDocx } from '../../scripts/pocketbase/docx-import.mjs';
import { collectDocuments, repositoryUrls } from '../../scripts/pocketbase/artifactory-import.mjs';
import { repairImportedPublicationDate, sourcePublicationDate } from '../../scripts/pocketbase/import-publication-date.mjs';

const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1xoAAAAASUVORK5CYII=';
const p = (text, style = '', props = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${props}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
export async function fixture(body) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>${body}</w:body></w:document>`);
  zip.file('word/styles.xml', `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style><w:style w:styleId="Hebrew"><w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>`);
  zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="image1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image.png"/><Relationship Id="link1" Target="javascript:alert(1)" TargetMode="External"/></Relationships>');
  zip.file('word/media/image.png', image, { base64: true });
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('splits the observed collection layout, retaining titles, images, subheadings and Hebrew styling', async () => {
  const buffer = await fixture(p('Collection cover', 'Title') + p('Run date: 2026-09-09') + p('כתבה ראשונה', 'Heading1') + p('שלום עולם', 'Hebrew') + p('בתוך הכתבה', 'Heading2') + '<w:p><w:r><w:drawing><a:blip r:embed="image1"/></w:drawing></w:r></w:p>' + p('{ AI }') + p('Second article', 'Heading1') + p('English paragraph'));
  const articles = await parseDocx(buffer);
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, 'כתבה ראשונה');
  assert.equal(articles[0].textAlignment, 'right');
  assert.match(articles[0].content, /dir="rtl" style="text-align:center"><strong>שלום עולם/);
  assert.match(articles[0].content, /<h2/);
  assert.match(articles[0].coverImage, /^data:image\/png;base64,/);
  assert.doesNotMatch(articles[0].content, /Collection cover|Run date|כתבה ראשונה|\{ AI \}/);
  assert.equal(articles[1].textAlignment, 'left');
  assert.doesNotMatch(articles[1].content, /data:image/);
});

test('splits repeated Title styles and handles a single article without headings', async () => {
  const articles = await parseDocx(await fixture(p('One', 'Title') + p('Body one') + p('Two', 'Title') + p('Body two')));
  assert.deepEqual(articles.map((a) => a.title), ['One', 'Two']);
  assert.equal((await parseDocx(await fixture(p('Standalone text')))).length, 1);
});

test('uses the source publication date as article metadata instead of body text', async () => {
  const articles = await parseDocx(await fixture(p('One', 'Heading1') + p('פורסם: 2026-06-16 11:35:52 +0000') + p('Body one') + p('Two', 'Heading1') + p('פורסם: 2026-06-23 23:35:52 -0400') + p('Body two')));
  assert.equal(articles[0].publishedAt, '2026-06-16');
  assert.equal(articles[1].publishedAt, '2026-06-23');
  for (const article of articles) {
    assert.doesNotMatch(article.content, /פורסם:/);
    assert.doesNotMatch(article.excerpt, /פורסם:/);
  }
});

test('repairs old date paragraphs without changing article content and is safe to repeat', () => {
  const body = '<p dir="rtl"><span>פורסם: 2026-06-16 11:35:52 +0000</span></p><p>Edited body</p><img src="data:image/png;base64,abc">';
  const repaired = repairImportedPublicationDate(body);
  assert.deepEqual(repaired, { publishedAt: '2026-06-16', content: '<p>Edited body</p><img src="data:image/png;base64,abc">' });
  assert.equal(repairImportedPublicationDate(repaired.content), null);
  assert.equal(repairImportedPublicationDate('<p>Intro</p>' + body), null);
  assert.equal(sourcePublicationDate('פורסם: 2026-02-30 11:35:52 +0000'), '');
  assert.equal(sourcePublicationDate('פורסם: yesterday'), '');
});

test('escapes document text, rejects active links and XML entities', async () => {
  const result = await parseDocx(await fixture(p('&lt;script&gt;alert(1)&lt;/script&gt;') + '<w:p><w:hyperlink r:id="link1"><w:r><w:t>link</w:t></w:r></w:hyperlink></w:p>'));
  assert.doesNotMatch(result[0].content, /<script|javascript:/);
  assert.match(result[0].content, /&lt;script&gt;/);
  const zip = new JSZip();
  zip.file('word/document.xml', '<!DOCTYPE x [<!ENTITY external SYSTEM "file:///etc/passwd">]><x/>');
  await assert.rejects(parseDocx(await zip.generateAsync({ type: 'nodebuffer' })), /unsupported XML/);
});

test('requires a repository HTTPS URL and strips storage API paths', () => {
  assert.equal(repositoryUrls('https://host/artifactory/api/storage/generic-local/folder/').root, 'https://host/artifactory/generic-local/folder');
  for (const url of ['http://host/artifactory/repo', 'https://user:token@host/artifactory/repo', 'https://host/artifactory', 'https://host/artifactory/repo?token=secret']) assert.throws(() => repositoryUrls(url));
});

test('authenticates server-side, skips unchanged files and retries changed files', async () => {
  const buffer = await fixture(p('Article', 'Heading1') + p('Body'));
  const sha1 = createHash('sha1').update(buffer).digest('hex');
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('reader:private-token').toString('base64')}`);
    assert.equal(options.redirect, 'error');
    return url.includes('/api/storage/') ? Response.json({ files: [{ uri: '/article.docx', sha1 }, { uri: '/ignore.pdf' }] }) : new Response(buffer);
  };
  const settings = { repositoryUrl: 'https://host/artifactory/repo', username: 'reader', token: 'private-token' };
  const first = await collectDocuments(settings, fetcher);
  assert.equal(first.documents.length, 1);
  const repeat = await collectDocuments({ ...settings, known: [first.documents[0].sourceKey] }, fetcher);
  assert.equal(repeat.documents.length, 0);
  assert.equal(repeat.skipped, 1);
  assert.equal(requests.length, 3);
});

test('reports failures without credentials and rotates batches past failed documents', async () => {
  const settings = { repositoryUrl: 'https://host/artifactory/repo', username: 'reader', token: 'private-token' };
  await assert.rejects(collectDocuments(settings, async () => new Response('private-token', { status: 401 })), /HTTP 401/);
  const files = ['a', 'b', 'c', 'd'].map((name) => ({ uri: `/${name}.docx` }));
  const fetcher = async (url) => url.includes('/api/storage/') ? Response.json({ files }) : new Response('invalid zip');
  const first = await collectDocuments(settings, fetcher);
  assert.equal(first.errors.length, 3);
  assert.equal(first.deferred, 1);
  const next = await collectDocuments({ ...settings, cursor: first.cursor }, fetcher);
  assert.equal(next.errors[0].file, '/d.docx');
  assert.doesNotMatch(JSON.stringify(next), /private-token/);
});
