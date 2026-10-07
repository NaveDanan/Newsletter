// Local integration fixture. Uses the real parser without contacting Artifactory.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = process.env.IMPORT_TEST_APP_ROOT;
if (!appRoot) throw new Error('IMPORT_TEST_APP_ROOT is required for the test worker.');
const { collectDocuments, repositoryUrls } = await import(pathToFileURL(path.join(appRoot, 'scripts/pocketbase/artifactory-import.mjs')));
const JSZip = createRequire(path.join(appRoot, 'package.json'))('jszip');
const settings = JSON.parse(await readFile(process.argv[2], 'utf8'));

async function document(articles) {
  const zip = new JSZip();
  const body = articles.map(([title, content]) => `<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>${title}</w:t></w:r></w:p>${content ? `<w:p><w:r><w:t>${content}</w:t></w:r></w:p>` : ''}`).join('');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`, { date: new Date('2026-01-01T00:00:00Z'), createFolders: false });
  return zip.generateAsync({ type: 'nodebuffer' });
}

try {
  let result;
  if (settings.validateOnly) result = repositoryUrls(settings.repositoryUrl);
  else {
    const documents = new Map([
      ['/valid.docx', await document([['First article', 'First body'], ['Second article', 'Second body']])],
      ['/broken.docx', Buffer.from('invalid DOCX')],
      ['/empty.docx', await document([['Title without content', '']])],
      ['/save-failure.docx', await document([['Must roll back', 'Body before failure'], ['Reject this article', 'Rejected body']])],
    ]);
    result = await collectDocuments(settings, async (url, options) => {
      if (options.headers.Authorization !== `Basic ${Buffer.from('reader:test-token').toString('base64')}`) return new Response('', { status: 401 });
      if (url.includes('/api/storage/')) return Response.json({ files: [...documents].map(([uri, buffer]) => ({ uri, sha1: createHash('sha1').update(buffer).digest('hex') })) });
      return new Response(documents.get('/' + new URL(url).pathname.split('/').at(-1)));
    });
  }
  process.stdout.write(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, message: error.message }));
}
