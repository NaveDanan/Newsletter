import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseDocx } from './docx-import.mjs';

export function repositoryUrls(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid Artifactory repository URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS repository URL without credentials, a query or a fragment.');
  url.pathname = url.pathname.replace(/\/+$/, '').replace('/artifactory/api/storage/', '/artifactory/');
  const match = url.pathname.match(/^(.*\/artifactory)\/([^/]+)(\/.*)?$/);
  if (!match) throw new Error('Include the generic repository name in the URL, for example https://host/artifactory/generic-local/newsletters.');
  return { root: url.href, listing: `${url.origin}${match[1]}/api/storage/${match[2]}${match[3] || ''}?list&deep=1&listFolders=0` };
}

export async function collectDocuments(settings, fetcher = fetch) {
  const urls = repositoryUrls(settings.repositoryUrl);
  const authorization = `Basic ${Buffer.from(`${settings.username}:${settings.token}`).toString('base64')}`;
  async function request(url, limit) {
    let response;
    try {
      response = await fetcher(url, { headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    } catch { throw new Error('Cannot reach Artifactory. Check the URL, TLS certificate and network access. Redirects are not followed.'); }
    if (!response.ok) throw new Error(`Artifactory returned HTTP ${response.status}. Check repository permissions and credentials.`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw new Error('Artifactory response exceeds the supported size.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const listing = JSON.parse((await request(urls.listing, 10 * 1024 * 1024)).toString('utf8'));
  if (!Array.isArray(listing.files)) throw new Error('Artifactory did not return a file list. Check the repository URL and File List API permissions.');
  let candidates = listing.files.filter((f) => !f.folder && /\.docx$/i.test(f.uri || '')).sort((a, b) => String(a.uri).localeCompare(String(b.uri)));
  const resume = candidates.findIndex((f) => f.uri === settings.cursor) + 1;
  candidates = [...candidates.slice(resume), ...candidates.slice(0, resume)];
  const documents = [], errors = [];
  let skipped = 0, deferred = 0, attempts = 0, bytes = 0, cursor = settings.cursor || '';
  const known = new Set(settings.known || []);
  for (const file of candidates) {
    const segments = String(file.uri).replace(/^\//, '').split('/');
    // File-list URIs are repository paths, never independently supplied download hosts.
    if (segments.some((s) => !s || s === '.' || s === '..' || /[\\\x00-\x1f]/.test(s))) {
      errors.push({ file: file.uri, message: 'Invalid artifact path.' }); continue;
    }
    const sourceUrl = `${urls.root}/${segments.map(encodeURIComponent).join('/')}`;
    const fingerprint = (checksum) => createHash('sha256').update(`${sourceUrl}\n${checksum}`).digest('hex');
    if (file.sha1 && known.has(fingerprint(file.sha1))) { skipped++; continue; }
    if (attempts >= 3 || bytes >= 25 * 1024 * 1024) { deferred++; continue; }
    attempts++;
    cursor = file.uri;
    try {
      if (Number(file.size) > 20 * 1024 * 1024) throw new Error('DOCX exceeds the 20 MB limit.');
      const buffer = await request(sourceUrl, 20 * 1024 * 1024);
      const checksum = createHash('sha1').update(buffer).digest('hex');
      if (file.sha1 && checksum !== file.sha1) throw new Error('Artifact changed during download. Retry the import.');
      const sourceKey = fingerprint(checksum);
      if (known.has(sourceKey)) { skipped++; continue; }
      const articles = await parseDocx(buffer, segments.at(-1));
      bytes += Buffer.byteLength(JSON.stringify(articles));
      documents.push({ sourceKey, sourceUrl, checksum, file: file.uri, articles });
    } catch (error) { errors.push({ file: file.uri, message: error.message }); }
  }
  return { documents, errors, skipped, deferred, found: candidates.length, cursor };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Bound subprocess lifetime even if a remote server stalls or document parsing hangs.
  const watchdog = setTimeout(() => process.exit(1), 120000);
  try {
    const settings = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const result = settings.validateOnly ? repositoryUrls(settings.repositoryUrl) : await collectDocuments(settings);
    process.stdout.write(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, message: error instanceof SyntaxError ? 'Artifactory returned invalid JSON.' : error.message }));
  } finally { clearTimeout(watchdog); }
}
