import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseDocx } from './docx-import.mjs';

const connectionReasons = new Map([
  ['ENOTFOUND', 'The Artifactory hostname could not be resolved. Check the repository URL and DNS access from the Newsletter container.'],
  ['EAI_AGAIN', 'Artifactory DNS lookup temporarily failed. Check cluster DNS and retry.'],
  ...['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_UNTRUSTED', 'CERT_SIGNATURE_FAILURE'].map((code) => [code, 'The Artifactory TLS certificate chain could not be verified. Check the issuing CA trust inside the Newsletter container and the certificate chain served by Artifactory.']),
  ['CERT_HAS_EXPIRED', 'The Artifactory TLS certificate has expired. Ask the server administrator to renew it.'],
  ['CERT_NOT_YET_VALID', 'The Artifactory TLS certificate is not yet valid. Check the certificate dates and cluster clock.'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'The Artifactory TLS certificate does not cover the URL hostname. Check the repository hostname.'],
  ...['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].map((code) => [code, 'The Artifactory request timed out. Check pod egress, routing, firewall rules and server availability.']),
  ['ECONNREFUSED', 'The Artifactory connection was refused. Check the hostname, port and server availability.'],
  ...['ENETUNREACH', 'EHOSTUNREACH'].map((code) => [code, 'The Artifactory network or host is unreachable. Check pod egress and cluster routing.']),
  ['ECONNRESET', 'The Artifactory connection was reset before the response completed. Check the server and network connection.'],
  ['UND_ERR_SOCKET', 'The Artifactory connection closed before the response completed. Check the server and network connection.'],
]);

function connectionFailure(error) {
  // Fetch wraps transport failures in cause and may aggregate per-address errors.
  // Never copy raw error messages, unknown codes, URLs or response bodies.
  const pending = [error], seen = new Set();
  while (pending.length && seen.size < 32) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    const reason = connectionReasons.get(current.code);
    if (reason) return `Artifactory request failed (${current.code}): ${reason}`;
    if (current.name === 'TimeoutError') return 'Artifactory request timed out (TimeoutError). Check pod egress, routing and server availability.';
    if (current.name === 'AbortError') return 'Artifactory request was interrupted (AbortError). The request may have timed out.';
    pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors.slice(0, 32));
  }
  return 'Cannot reach Artifactory. An unexpected connection failure occurred. Check network access from the Newsletter container.';
}

function httpFailure(status) {
  const reasons = {
    400: 'The repository API rejected the request. Check the repository URL.',
    401: 'Authentication failed. Check the saved username and token credentials.',
    403: 'Access was denied. Check repository read and File List API permissions.',
    404: 'The repository or artifact path was not found. Check the URL, repository name, folder and read permissions.',
    405: 'The endpoint does not support this request. Check that the URL points to the Artifactory repository API.',
    429: 'The Artifactory rate limit was reached. Wait and retry.',
  };
  const reason = reasons[status] || (status >= 500 ? 'An Artifactory server or upstream error occurred. Check server availability and logs.' : 'Check the repository URL and server configuration.');
  return `Artifactory returned HTTP ${status}. ${reason}`;
}

class ArtifactoryRequestError extends Error {}

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
      response = await fetcher(url, { headers: { Authorization: authorization }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    } catch (error) { throw new ArtifactoryRequestError(connectionFailure(error)); }
    if (!response.ok) {
      // Discard error responses without exposing their contents or redirect URLs.
      try { await response.body?.cancel(); } catch { /* Keep the original HTTP failure. */ }
      if (response.status >= 300 && response.status < 400) throw new ArtifactoryRequestError(`Artifactory returned a redirect (HTTP ${response.status}). Use the direct HTTPS repository URL, without a UI or SSO redirect. Redirects are not followed.`);
      throw new ArtifactoryRequestError(httpFailure(response.status));
    }
    const chunks = [];
    let size = 0;
    try {
      if (response.body) for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limit) throw new ArtifactoryRequestError('Artifactory response exceeds the supported size.');
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof ArtifactoryRequestError) throw error;
      throw new ArtifactoryRequestError(connectionFailure(error));
    }
    return Buffer.concat(chunks);
  }
  const listingBody = await request(urls.listing, 10 * 1024 * 1024);
  let listing;
  try { listing = JSON.parse(listingBody.toString('utf8')); }
  catch { throw new ArtifactoryRequestError('Artifactory returned invalid JSON. Check that the repository URL reaches the File List API rather than a UI or login page.'); }
  if (!listing || !Array.isArray(listing.files)) throw new ArtifactoryRequestError('Artifactory did not return a file list. Check the repository URL and File List API permissions.');
  let candidates = listing.files.filter((f) => !f.folder && /\.docx$/i.test(f.uri || '')).sort((a, b) => String(a.uri).localeCompare(String(b.uri)));
  const resume = candidates.findIndex((f) => f.uri === settings.cursor) + 1;
  candidates = [...candidates.slice(resume), ...candidates.slice(0, resume)];
  const documents = [], errors = [];
  let skipped = 0, deferred = 0, attempts = 0, bytes = 0, cursor = settings.cursor || '';
  const known = new Set(settings.known || []);
  const visited = new Set(settings.visited || []);
  const processed = [];
  for (const file of candidates) {
    if (visited.has(file.uri)) continue;
    const segments = String(file.uri).replace(/^\//, '').split('/');
    // File-list URIs are repository paths, never independently supplied download hosts.
    if (segments.some((s) => !s || s === '.' || s === '..' || /[\\\x00-\x1f]/.test(s))) {
      processed.push(file.uri); errors.push({ file: file.uri, message: 'Invalid artifact path.' }); continue;
    }
    const sourceUrl = `${urls.root}/${segments.map(encodeURIComponent).join('/')}`;
    const fingerprint = (checksum) => createHash('sha256').update(`${sourceUrl}\n${checksum}`).digest('hex');
    if (file.sha1 && known.has(fingerprint(file.sha1))) { processed.push(file.uri); skipped++; continue; }
    if (attempts >= 3 || bytes >= 25 * 1024 * 1024) { deferred++; continue; }
    attempts++;
    processed.push(file.uri);
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
  return { documents, errors, skipped, deferred, found: candidates.length, cursor, processed };
}

export function validateTracking(settings) {
  const url = new URL(settings.sourceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/\.docx$/i.test(url.pathname)) throw new Error('Use the HTTPS URL of a DOCX file, without credentials or query parameters.');
  const checksum = String(settings.checksum || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(checksum)) throw new Error('Enter the 40-character SHA-1 checksum from Artifactory.');
  return { sourceUrl: url.href, checksum, sourceKey: createHash('sha256').update(`${url.href}\n${checksum}`).digest('hex') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Bound subprocess lifetime even if a remote server stalls or document parsing hangs.
  const watchdog = setTimeout(() => process.exit(1), 120000);
  try {
    const settings = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const result = settings.validateOnly ? repositoryUrls(settings.repositoryUrl) : settings.validateTracking ? validateTracking(settings) : await collectDocuments(settings);
    process.stdout.write(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, message: error instanceof SyntaxError ? 'Artifactory returned invalid JSON.' : error.message }));
  } finally { clearTimeout(watchdog); }
}
