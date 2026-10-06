import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DEFAULT_ICONS } from '@/components/ui/icon-picker-icons';

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
      <canvas ref={canvasRef} className="hidden" />
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
            tab === 'defaults' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]',
          )}
        >
          Default Icons
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'upload' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]',
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
