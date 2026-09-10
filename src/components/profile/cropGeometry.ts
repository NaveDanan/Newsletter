export type CropShape = 'avatar' | 'cover';

export interface Size {
  w: number;
  h: number;
}

export interface CropGeometry {
  /** What the user drags in. */
  view: Size;
  /** What is written to the PNG. Same aspect ratio as `view`, by construction. */
  out: Size;
  round: boolean;
}

/**
 * `out` is `view` times a single factor, which is what lets the export replay
 * the preview transform verbatim: a point at (x, y) in the editor lands at
 * (x·k, y·k) on the canvas, so what the user framed is exactly what is saved.
 *
 * The cover ratio is 4:1 — the band it is shown in inside the profile dialog.
 */
export const CROP_GEOMETRY: Record<CropShape, CropGeometry> = {
  avatar: { view: { w: 300, h: 300 }, out: { w: 512, h: 512 }, round: true },
  cover: { view: { w: 440, h: 110 }, out: { w: 1408, h: 352 }, round: false },
};

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 6;

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Scale at which the untouched image exactly covers the viewport. */
export function coverScale(view: Size, natural: Size): number {
  if (!natural.w || !natural.h) return 1;
  return Math.max(view.w / natural.w, view.h / natural.h);
}

export interface CropState {
  baseScale: number;
  zoom: number;
  /** Degrees, free (the 90° buttons are just two of the values). */
  rotation: number;
  /** Viewport pixels the image was dragged by. */
  offset: { x: number; y: number };
}

/** The CSS `transform` of the preview image, rotated about its own centre. */
export function previewTransform(state: CropState): string {
  const { zoom, baseScale, rotation, offset } = state;
  return `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${baseScale * zoom})`;
}

/** Canvas ratio between the exported image and the editing viewport. */
export function exportScale(geometry: CropGeometry): number {
  return geometry.out.w / geometry.view.w;
}

/**
 * The same transform for `CanvasRenderingContext2D.setTransform`, in the order
 * translate → rotate → scale. Applied to an image drawn at `-w/2, -h/2`, it
 * places it exactly where the preview shows it.
 */
export function canvasTransform(geometry: CropGeometry, state: CropState): DOMMatrix2DInit {
  const k = exportScale(geometry);
  const scale = state.baseScale * state.zoom * k;
  const radians = (state.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    a: cos * scale,
    b: sin * scale,
    c: -sin * scale,
    d: cos * scale,
    e: geometry.out.w / 2 + state.offset.x * k,
    f: geometry.out.h / 2 + state.offset.y * k,
  };
}
