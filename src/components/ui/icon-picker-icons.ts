/* ------------------------------------------------------------------ */
/*  Default icon SVG data-URIs (24×24, stroke-based, Lucide-style)    */
/* ------------------------------------------------------------------ */

function svgDataUri(paths: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23171717" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`)}`;
}

export const DEFAULT_ICONS: { key: string; label: string; url: string }[] = [
  { key: 'globe', label: 'Globe', url: svgDataUri('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>') },
  { key: 'link', label: 'Link', url: svgDataUri('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>') },
  { key: 'star', label: 'Star', url: svgDataUri('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>') },
  { key: 'book', label: 'Book', url: svgDataUri('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>') },
  { key: 'code', label: 'Code', url: svgDataUri('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>') },
  { key: 'chart', label: 'Chart', url: svgDataUri('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>') },
  { key: 'zap', label: 'Zap', url: svgDataUri('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>') },
  { key: 'shield', label: 'Shield', url: svgDataUri('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>') },
  { key: 'cloud', label: 'Cloud', url: svgDataUri('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10"/>') },
  { key: 'mail', label: 'Mail', url: svgDataUri('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>') },
  { key: 'database', label: 'Database', url: svgDataUri('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>') },
  { key: 'tool', label: 'Tool', url: svgDataUri('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>') },
  { key: 'cpu', label: 'CPU / AI', url: svgDataUri('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>') },
  { key: 'play', label: 'Play', url: svgDataUri('<polygon points="6 3 20 12 6 21 6 3"/>') },
  { key: 'heart', label: 'Heart', url: svgDataUri('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>') },
  { key: 'users', label: 'Users', url: svgDataUri('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') },
];
