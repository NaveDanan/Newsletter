import { useEffect, useRef, useState } from 'react';
import { getPocketBase } from '@/lib/pocketbase/client';
import { cachedRead, readScope } from '@/lib/pocketbase/read-cache';
import type { Newsletter } from '@/types/newsletter';

/** Draft thumbnails need a bearer header, which an ordinary img cannot send. */
export function NewsletterCoverImage({ newsletter, className }: { newsletter: Newsletter; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [image, setImage] = useState<{ source: string; scope: string; url: string }>();
  const src = newsletter.coverImage;
  const pb = getPocketBase(), scope = readScope();
  const endpoint = `/api/newsletters/${encodeURIComponent(newsletter.id)}/cover`;
  const base = pb.baseURL.replace(/\/$/, '');
  const protectedCover = newsletter.status === 'draft' && [endpoint, base + endpoint].some((path) => src === path || src.startsWith(path + '?'));

  useEffect(() => {
    if (!protectedCover || !ref.current) return;
    let cancelled = false, objectUrl: string | undefined;
    const token = pb.authStore.token;
    const load = () => {
      const url = src.startsWith('/') ? base + src : src;
      void cachedRead(`newsletter-cover:${url}`, async () => {
        const response = await fetch(url, { headers: { Authorization: token } });
        if (!response.ok) throw new Error('Newsletter cover unavailable');
        return response.blob();
      }, { maxAge: 300_000 }).then((blob) => {
        if (cancelled || scope !== readScope()) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ source: src, scope, url: objectUrl });
      }).catch(() => { /* Preserve the thumbnail placeholder if access fails. */ });
    };
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: '600px' });
    if (observer) observer.observe(ref.current); else load();
    return () => { cancelled = true; observer?.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [base, pb, protectedCover, scope, src]);

  return <img ref={ref} loading="lazy" decoding="async" src={protectedCover ? image?.source === src && image.scope === scope ? image.url : undefined : src} alt={newsletter.title || 'Newsletter cover'} className={className} />;
}
