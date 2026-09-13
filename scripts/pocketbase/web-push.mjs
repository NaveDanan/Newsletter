import webpush from 'web-push';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && /^(fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/.test(url.hostname);
  } catch { return false; }
}

export async function deliverPushBatch(input, send = webpush.sendNotification.bind(webpush)) {
  return Promise.all(input.items.map(async (item) => {
    if (!validPushEndpoint(item.subscription?.endpoint)) return { id: item.id, status: 410 };
    try {
      await send(item.subscription, JSON.stringify(item.payload), {
        vapidDetails: { subject: input.subject, publicKey: input.publicKey, privateKey: input.privateKey },
        TTL: 3600, urgency: 'normal', timeout: 10000,
      });
      return { id: item.id, status: 201 };
    } catch (error) {
      // Never put endpoint tokens, subscription keys or VAPID keys in logs.
      return { id: item.id, status: Number(error.statusCode) || 503 };
    }
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const result = input.action === 'keys' ? webpush.generateVAPIDKeys() : await deliverPushBatch(input);
    process.stdout.write(JSON.stringify({ ok: true, result }));
  } catch { process.stdout.write(JSON.stringify({ ok: false, message: 'Web Push worker failed.' })); }
}
