import type { Newsletter } from '@/types/newsletter';

const MAX_AGE = 300_000;
const MAX_ARTICLES = 8;
let opening: Promise<IDBDatabase | undefined> | undefined;
function database(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined);
  if (!opening) opening = new Promise((resolve) => {
    try {
      const request = indexedDB.open('newsletter-public-articles', 1);
      request.onupgradeneeded = () => { const store = request.result.createObjectStore('articles', { keyPath: 'key' }); store.createIndex('at', 'at'); };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening = undefined; }; resolve(request.result); };
      request.onerror = request.onblocked = () => { opening = undefined; resolve(undefined); };
    } catch { resolve(undefined); }
  });
  return opening;
}

export async function readStoredArticle(key: string): Promise<Newsletter | undefined> {
  const db = await database();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = db.transaction('articles').objectStore('articles').get(key);
      request.onsuccess = () => {
        const value = request.result as { at?: number; newsletter?: Newsletter } | undefined;
        resolve(value?.at && Date.now() - value.at <= MAX_AGE && value.newsletter?.status === 'published' ? value.newsletter : undefined);
      };
      request.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

export async function storePublicArticle(key: string, newsletter: Newsletter): Promise<void> {
  if (newsletter.status !== 'published' || newsletter.content.length + newsletter.coverImage.length > 4_000_000) return;
  const db = await database();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction('articles', 'readwrite'), store = transaction.objectStore('articles');
      store.put({ key, at: Date.now(), newsletter });
      const count = store.count();
      count.onsuccess = () => {
        let remaining = count.result - MAX_ARTICLES;
        if (remaining <= 0) return;
        const cursor = store.index('at').openCursor();
        cursor.onsuccess = () => { const current = cursor.result; if (current && remaining-- > 0) { current.delete(); current.continue(); } };
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export async function forgetStoredArticle(key: string): Promise<void> {
  const db = await database();
  try { db?.transaction('articles', 'readwrite').objectStore('articles').delete(key); } catch { /* Optional cache. */ }
}
