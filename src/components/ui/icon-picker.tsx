import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

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

/* ------------------------------------------------------------------ */
/*  Image crop/pan/zoom editor (inline, lightweight)                  */
/* ------------------------------------------------------------------ */

interface ImageEditorProps {
  src: string;
  onDone: (dataUrl: string) => void;
  onCancel: () => void;
}

function ImageEditor({ src, onDone, onCancel }: ImageEditorProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const SIZE = 128;

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setOffset((prev) => ({
      x: prev.x + (e.clientX - lastPos.current.x),
      y: prev.y + (e.clientY - lastPos.current.y),
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    dragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) => Math.min(5, Math.max(0.2, prev - e.deltaY * 0.002)));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragging.current = true;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || e.touches.length !== 1) return;
    e.preventDefault();
    setOffset((prev) => ({
      x: prev.x + (e.touches[0].clientX - lastPos.current.x),
      y: prev.y + (e.touches[0].clientY - lastPos.current.y),
    }));
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = () => {
    dragging.current = false;
  };

  const exportImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = SIZE;
    canvas.height = SIZE;
    ctx.clearRect(0, 0, SIZE, SIZE);

    const img = imgRef.current;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (SIZE - w) / 2 + offset.x;
    const y = (SIZE - h) / 2 + offset.y;

    ctx.drawImage(img, x, y, w, h);
    onDone(canvas.toDataURL('image/png'));
  }, [offset, scale, onDone]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#737373]">Drag to pan, scroll to zoom. The visible area will be used as your icon.</p>
      <div
        ref={containerRef}
        className="relative mx-auto overflow-hidden rounded-xl border-2 border-dashed border-[#D93A3A] bg-[#FAFAFA] cursor-move select-none"
        style={{ width: SIZE, height: SIZE }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          ref={imgRef}
          src={src}
          alt="Edit"
          draggable={false}
          className="pointer-events-none absolute"
          style={{
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            maxWidth: 'none',
            maxHeight: 'none',
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-[#737373]">Zoom</label>
        <input
          type="range"
          min={0.2}
          max={5}
          step={0.05}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs text-[#737373] w-10 text-right">{Math.round(scale * 100)}%</span>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
        <button type="button" onClick={exportImage} className="btn-primary text-sm">Use this crop</button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  IconPicker                                                        */
/* ------------------------------------------------------------------ */

interface IconPickerProps {
  value: string;
  onChange: (iconUrl: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [tab, setTab] = useState<'defaults' | 'upload'>('defaults');
  const [uploadedRaw, setUploadedRaw] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        setUploadedRaw(result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleEditorDone = useCallback((dataUrl: string) => {
    onChange(dataUrl);
    setUploadedRaw(null);
  }, [onChange]);

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[#F5F5F5] p-1">
        <button
          type="button"
          onClick={() => setTab('defaults')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'defaults' ? 'bg-white text-[#171717] shadow-sm' : 'text-[#737373] hover:text-[#171717]',
          )}
        >
          Default Icons
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'upload' ? 'bg-white text-[#171717] shadow-sm' : 'text-[#737373] hover:text-[#171717]',
          )}
        >
          Custom Upload
        </button>
      </div>

      {tab === 'defaults' ? (
        <div className="grid grid-cols-8 gap-1.5">
          {DEFAULT_ICONS.map((icon) => (
            <button
              key={icon.key}
              type="button"
              title={icon.label}
              onClick={() => onChange(icon.url)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                value === icon.url
                  ? 'border-[#D93A3A] bg-[#FFF5F5]'
                  : 'border-[#E5E5E5] bg-white hover:border-[#A3A3A3]',
              )}
            >
              <img src={icon.url} alt={icon.label} className="h-5 w-5" />
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {uploadedRaw ? (
            <ImageEditor src={uploadedRaw} onDone={handleEditorDone} onCancel={() => setUploadedRaw(null)} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] px-4 py-6 text-sm text-[#737373] transition-colors hover:border-[#D93A3A] hover:bg-[#FFF5F5]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>Click to upload an image</span>
                <span className="text-xs">PNG, JPG, SVG, GIF — max 5 MB</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              {/* Or paste a URL */}
              <div>
                <label className="mb-1 block text-xs text-[#737373]">Or paste an image URL</label>
                <input
                  type="text"
                  value={value.startsWith('data:') ? '' : value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="https://example.com/icon.png"
                  className="w-full"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Preview */}
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[#E5E5E5] bg-white">
            <img src={value} alt="Icon preview" className="h-8 w-8 rounded-lg object-cover" />
          </div>
          <span className="text-xs text-[#737373]">This is how the icon will appear in the dropdown</span>
        </div>
      ) : null}
    </div>
  );
}
