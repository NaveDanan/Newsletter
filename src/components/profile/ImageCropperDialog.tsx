import { HugeiconsIcon } from '@hugeicons/react';
import {
  RotateLeft01Icon,
  RotateRight01Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/contexts/LocaleContext';
import {
  CROP_GEOMETRY,
  MAX_ZOOM,
  MIN_ZOOM,
  canvasTransform,
  clampZoom,
  coverScale,
  previewTransform,
  type CropGeometry,
  type CropShape,
  type CropState,
} from './cropGeometry';

/** The canvas is filled with this before the image, so a rotated corner is not a hole. */
const BACKDROP = '#FFFFFF';

function loadImage(src: string, errorMessage: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMessage));
    image.src = src;
  });
}

/** Replays the preview transform onto a canvas at export resolution. */
async function render(
  image: HTMLImageElement,
  geometry: CropGeometry,
  state: CropState,
  messages: { canvasError: string; encodeError: string },
): Promise<Blob> {
  const { out, round } = geometry;
  const canvas = document.createElement('canvas');
  canvas.width = out.w;
  canvas.height = out.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(messages.canvasError);
  }
  ctx.imageSmoothingQuality = 'high';

  // The avatar is clipped to the circle the editor showed, so the PNG itself is
  // round and every place it is drawn gets the same picture.
  if (round) {
    ctx.beginPath();
    ctx.arc(out.w / 2, out.h / 2, Math.min(out.w, out.h) / 2, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, out.w, out.h);

  ctx.setTransform(canvasTransform(geometry, state));
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) {
    throw new Error(messages.encodeError);
  }
  return blob;
}

interface ImageCropperDialogProps {
  file: File;
  shape: CropShape;
  onCancel: () => void;
  onApply: (blob: Blob) => void | Promise<void>;
}

/**
 * Crop editor for the profile picture: pan by dragging, zoom with the slider or
 * the wheel, rotate freely. The preview is a CSS transform and the export
 * replays the same transform on a canvas scaled by out/view, so what the user
 * framed is what gets saved.
 */
export function ImageCropperDialog({ file, shape, onCancel, onApply }: ImageCropperDialogProps) {
  const { t } = useLocale();
  const geometry = CROP_GEOMETRY[shape];
  const [src, setSrc] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const readError = t('profile.crop.readError');

  // One object URL per picked file, revoked when the dialog closes.
  useEffect(() => {
    // StrictMode mounts the effect twice; the cleanup revokes the first URL while
    // its load is still in flight, so that load must not be allowed to report.
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setImage(null);
    setError(null);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    loadImage(url, readError)
      .then((loaded) => {
        if (!cancelled) {
          setImage(loaded);
        }
      })
      .catch((loadFailure: Error) => {
        if (!cancelled) {
          setError(loadFailure.message);
        }
      });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file, readError]);

  const baseScale = useMemo(
    () => (image ? coverScale(geometry.view, { w: image.naturalWidth, h: image.naturalHeight }) : 1),
    [image, geometry.view],
  );

  const reset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!image) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setOffset((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!image) {
      return;
    }
    setZoom((current) => clampZoom(current * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
  };

  const apply = async () => {
    if (!image) {
      return;
    }
    setBusy(true);
    try {
      const blob = await render(
        image,
        geometry,
        { baseScale, zoom, rotation, offset },
        { canvasError: t('profile.crop.canvasError'), encodeError: t('profile.crop.encodeError') },
      );
      await onApply(blob);
    } catch (applyFailure) {
      setError(applyFailure instanceof Error ? applyFailure.message : String(applyFailure));
    } finally {
      setBusy(false);
    }
  };

  const transform = previewTransform({ baseScale, zoom, rotation, offset });

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) {
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-[min(520px,94vw)] gap-0 border-[#E5E5E5] bg-white p-0 sm:max-w-[520px]">
        <DialogHeader className="space-y-1 border-b border-[#E5E5E5] px-5 py-3.5 text-start">
          <DialogTitle className="text-base font-semibold text-[#171717]">
            {t('profile.crop.avatarTitle')}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#737373]">
            {t('profile.crop.hint')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="flex justify-center">
            <div
              style={{ width: geometry.view.w, height: geometry.view.h }}
              className="relative cursor-grab touch-none overflow-hidden rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={onWheel}
            >
              {src && image ? (
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                    maxWidth: 'none',
                    transform,
                    transformOrigin: 'center',
                  }}
                />
              ) : null}
              {/* Everything outside the circle is dimmed: that is the area the export drops. */}
              {geometry.round ? (
                <>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: 'rgba(255,255,255,0.72)',
                      WebkitMaskImage:
                        'radial-gradient(circle closest-side at 50% 50%, transparent 99%, #000 100%)',
                      maskImage:
                        'radial-gradient(circle closest-side at 50% 50%, transparent 99%, #000 100%)',
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-full border border-[#D4D4D4]" />
                </>
              ) : null}
              {!image && !error ? (
                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#737373]">
                  {t('profile.crop.loading')}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
              <div className="mb-1.5 flex items-center gap-2">
                <HugeiconsIcon icon={ZoomInAreaIcon} className="h-3.5 w-3.5" />
                {t('profile.crop.zoom')}
                <span className="ms-auto font-mono normal-case tracking-normal text-[#A3A3A3]">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-1 text-[#737373] transition-colors hover:text-[#171717]"
                  aria-label={t('profile.crop.zoomOut')}
                  onClick={() => {
                    setZoom((current) => clampZoom(current / 1.15));
                  }}
                >
                  <HugeiconsIcon icon={ZoomOutAreaIcon} className="h-3.5 w-3.5" />
                </button>
                {/* Forced LTR: the preview never mirrors, so a mirrored slider would invert the gesture. */}
                <input
                  dir="ltr"
                  type="range"
                  min={MIN_ZOOM * 100}
                  max={MAX_ZOOM * 100}
                  step={1}
                  value={Math.round(zoom * 100)}
                  onChange={(event) => {
                    setZoom(clampZoom(Number(event.target.value) / 100));
                  }}
                  className="w-full accent-[#D93A3A]"
                  aria-label={t('profile.crop.zoom')}
                />
                <button
                  type="button"
                  className="p-1 text-[#737373] transition-colors hover:text-[#171717]"
                  aria-label={t('profile.crop.zoomIn')}
                  onClick={() => {
                    setZoom((current) => clampZoom(current * 1.15));
                  }}
                >
                  <HugeiconsIcon icon={ZoomInAreaIcon} className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
              <div className="mb-1.5 flex items-center gap-2">
                <HugeiconsIcon icon={RotateRight01Icon} className="h-3.5 w-3.5" />
                {t('profile.crop.rotation')}
                <span className="ms-auto font-mono normal-case tracking-normal text-[#A3A3A3]">
                  {Math.round(rotation)}&deg;
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-1 text-[#737373] transition-colors hover:text-[#171717]"
                  aria-label={t('profile.crop.rotateLeft')}
                  onClick={() => {
                    setRotation((current) => Math.max(-180, current - 90));
                  }}
                >
                  <HugeiconsIcon icon={RotateLeft01Icon} className="h-3.5 w-3.5" />
                </button>
                <input
                  dir="ltr"
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={(event) => {
                    setRotation(Number(event.target.value));
                  }}
                  className="w-full accent-[#D93A3A]"
                  aria-label={t('profile.crop.rotation')}
                />
                <button
                  type="button"
                  className="p-1 text-[#737373] transition-colors hover:text-[#171717]"
                  aria-label={t('profile.crop.rotateRight')}
                  onClick={() => {
                    setRotation((current) => Math.min(180, current + 90));
                  }}
                >
                  <HugeiconsIcon icon={RotateRight01Icon} className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {error ? <p className="text-xs text-[#D93A3A]">{error}</p> : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#E5E5E5] px-5 py-3.5">
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
            {t('profile.crop.reset')}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#D93A3A] text-white hover:bg-[#B91C1C]"
              onClick={() => {
                void apply();
              }}
              disabled={!image || busy}
            >
              {busy ? t('profile.crop.applying') : t('profile.crop.apply')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
