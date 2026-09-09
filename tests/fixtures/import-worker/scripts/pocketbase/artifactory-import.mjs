// Disposable integration-test worker. Never included in the application image.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { collectDocuments, repositoryUrls, validateTracking } from '/app/scripts/pocketbase/artifactory-import.mjs';
const JSZip = createRequire('/app/package.json')('jszip');
const settings = JSON.parse(await readFile(process.argv[2], 'utf8'));
try {
  let result;
  if (settings.validateOnly) result = repositoryUrls(settings.repositoryUrl);
  else if (settings.validateTracking) result = validateTracking(settings);
  else {
    const documents = new Map();
    for (let i = 1; i <= 7; i++) {
      const zip = new JSZip();
      zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>Article ${i}</w:t></w:r></w:p><w:p><w:r><w:t>Body ${i}</w:t></w:r></w:p></w:body></w:document>`, { date: new Date('2026-01-01T00:00:00Z'), createFolders: false });
      documents.set(`/article-${i}.docx`, await zip.generateAsync({ type: 'nodebuffer' }));
    }
    documents.set('/broken.docx', Buffer.from('invalid DOCX'));
    result = await collectDocuments(settings, async (url, options) => {
      if (options.headers.Authorization !== `Basic ${Buffer.from('reader:test-token').toString('base64')}`) return new Response('', { status: 401 });
      if (url.includes('/api/storage/')) return Response.json({ files: [...documents].map(([uri, buffer]) => ({ uri, sha1: createHash('sha1').update(buffer).digest('hex') })) });
      return new Response(documents.get('/' + new URL(url).pathname.split('/').at(-1)));
    });
  }
  process.stdout.write(JSON.stringify({ ok: true, ...result }));
} catch (error) { process.stdout.write(JSON.stringify({ ok: false, message: error.message })); }
