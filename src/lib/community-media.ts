import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_VIDEO_MAX_BYTES,
} from '@/types/community';

// Everything the composer needs to know about a file before it is uploaded.
// The server enforces the same caps and re-derives nothing from the client, so
// the numbers measured here are a courtesy: they let the composer reject a
// 300 MB video without spending the upload, and they let a post render at the
// right aspect ratio before its media record exists.

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

// Images are re-encoded to fit inside this box before upload. A phone photo is
// routinely 4000 px wide and 8 MB; nothing in the feed renders wider than a
// column, so the bytes would be paid for and then thrown away.
const IMAGE_MAX_EDGE = 2048;
const IMAGE_QUALITY = 0.82;
// Animation frames are lost by a canvas re-encode, so a GIF is never touched.
const COMPRESSIBLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type CommunityMediaKind = 'image' | 'video';

export interface CommunityMediaProbe {
  kind: CommunityMediaKind;
  width: number;
  height: number;
  durationMs: number;
  /** An object URL for the local preview. The caller must revoke it. */
  previewUrl: string;
}

export function communityMediaKindOf(file: File): CommunityMediaKind | null {
  const type = (file.type || '').toLowerCase();
  if (IMAGE_TYPES.includes(type)) {
    return 'image';
  }
  if (VIDEO_TYPES.includes(type)) {
    return 'video';
  }
  return null;
}

export function communityMediaMaxBytes(kind: CommunityMediaKind): number {
  return kind === 'video' ? COMMUNITY_VIDEO_MAX_BYTES : COMMUNITY_IMAGE_MAX_BYTES;
}

export function isCommunityMediaTooLarge(file: File, kind: CommunityMediaKind): boolean {
  return file.size > communityMediaMaxBytes(kind);
}

function readImageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = objectUrl;
  });
}

function readVideoMetadata(objectUrl: string): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      resolve({ width: video.videoWidth, height: video.videoHeight, durationMs: duration });
    };
    video.onerror = () => resolve({ width: 0, height: 0, durationMs: 0 });
    video.src = objectUrl;
  });
}

export async function probeCommunityMedia(file: File, kind: CommunityMediaKind): Promise<CommunityMediaProbe> {
  const previewUrl = URL.createObjectURL(file);

  if (kind === 'video') {
    const meta = await readVideoMetadata(previewUrl);
    return { kind, previewUrl, ...meta };
  }

  const size = await readImageDimensions(previewUrl);
  return { kind, previewUrl, width: size.width, height: size.height, durationMs: 0 };
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, type: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], name, { type: blob.type || type }) : null),
      type,
      IMAGE_QUALITY,
    );
  });
}

function replaceExtension(name: string, extension: string): string {
  const base = name.replace(/[.][^.]+$/, '');
  return `${base || 'image'}.${extension}`;
}

// Downscales and re-encodes an image so a phone photo does not cost 8 MB of
// upload for a 600 px column. Returns the original file when it is already
// small enough, when the format cannot survive a re-encode, or when the canvas
// result would be larger than what came in.
export async function compressCommunityImage(file: File): Promise<File> {
  const type = (file.type || '').toLowerCase();
  if (!COMPRESSIBLE_TYPES.includes(type)) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => resolve(null);
      element.src = objectUrl;
    });

    if (!image || !image.naturalWidth || !image.naturalHeight) {
      return file;
    }

    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestEdge > IMAGE_MAX_EDGE ? IMAGE_MAX_EDGE / longestEdge : 1;
    if (scale === 1 && file.size <= COMMUNITY_IMAGE_MAX_BYTES / 4) {
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      return file;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // PNG screenshots of text stay PNG; photographs become JPEG, which is where
    // the saving actually is.
    const outputType = type === 'image/png' ? 'image/png' : 'image/jpeg';
    const outputName = replaceExtension(file.name, outputType === 'image/png' ? 'png' : 'jpg');
    const encoded = await canvasToFile(canvas, outputName, outputType);

    return encoded && encoded.size > 0 && encoded.size < file.size ? encoded : file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
