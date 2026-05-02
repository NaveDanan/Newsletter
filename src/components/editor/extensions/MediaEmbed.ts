import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MediaEmbedView } from './MediaEmbedView';

export type MediaEmbedType = 'video' | 'audio' | 'pdf' | 'pptx';
export type MediaEmbedTextWrap = 'break' | 'left' | 'right';

export function normalizePreviewUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizePreviewUrls(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeMediaOffset(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeMediaDimension(value: unknown, fallback: string | null = null) {
  if (typeof value === 'number') {
    return `${value}px`;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

export function getDefaultMediaHeight(mediaType: MediaEmbedType) {
  if (mediaType === 'pdf' || mediaType === 'pptx') {
    return '500px';
  }

  return null;
}

export function isInteractiveMediaType(mediaType: MediaEmbedType) {
  return mediaType === 'video' || mediaType === 'pdf' || mediaType === 'pptx';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mediaEmbed: {
      insertMediaEmbed: (options: {
        src: string;
        mediaType: MediaEmbedType;
        title?: string;
        width?: string;
        height?: string;
        textWrap?: MediaEmbedTextWrap;
        offsetX?: number;
        offsetY?: number;
        previewUrls?: string[];
        previewStatus?: 'ready' | 'failed';
        previewError?: string;
      }) => ReturnType;
    };
  }
}

/** Resolve the YouTube or Vimeo embed URL; otherwise return src unchanged. */
function resolveVideoEmbedUrl(src: string): string {
  const ytMatch = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

  const vimeoMatch = src.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return src;
}

/** Build the final src used inside an <iframe>. */
export function buildEmbedSrc(mediaType: MediaEmbedType, src: string): string {
  if (mediaType === 'video') {
    return resolveVideoEmbedUrl(src);
  }
  return src;
}

/**
 * Returns true when the media should be shown in an <iframe> rather than a
 * native <video> element (YouTube, Vimeo, PDF, PowerPoint).
 */
export function isIframeEmbed(mediaType: MediaEmbedType, src: string): boolean {
  if (mediaType === 'pdf') return true;
  if (mediaType === 'video') {
    return (
      /(?:youtube\.com|youtu\.be)/.test(src) ||
      /vimeo\.com/.test(src)
    );
  }
  return false;
}

export const MediaEmbed = Node.create({
  name: 'mediaEmbed',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      mediaType: { default: 'video' as MediaEmbedType },
      title: { default: null },
      width: { default: '100%' },
      height: { default: null },
      textWrap: { default: 'break' as MediaEmbedTextWrap },
      offsetX: { default: 0 },
      offsetY: { default: 0 },
      previewUrls: { default: [] },
      previewStatus: { default: null },
      previewError: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-media-embed]',
        getAttrs: (dom) => {
          if (typeof dom === 'string') return {};
          const el = dom as HTMLElement;
          return {
            src: el.getAttribute('data-media-src'),
            mediaType: el.getAttribute('data-media-type'),
            title: el.getAttribute('data-media-title'),
            width: el.getAttribute('data-media-width') || '100%',
            height: el.getAttribute('data-media-height'),
            textWrap: el.getAttribute('data-media-text-wrap') || 'break',
            offsetX: normalizeMediaOffset(el.getAttribute('data-media-offset-x')),
            offsetY: normalizeMediaOffset(el.getAttribute('data-media-offset-y')),
            previewUrls: normalizePreviewUrls(el.getAttribute('data-media-preview-urls')),
            previewStatus: el.getAttribute('data-media-preview-status'),
            previewError: el.getAttribute('data-media-preview-error'),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src as string;
    const mediaType = HTMLAttributes.mediaType as MediaEmbedType;
    const title = HTMLAttributes.title as string | null | undefined;
    const width = normalizeMediaDimension(HTMLAttributes.width, '100%') ?? '100%';
    const height = normalizeMediaDimension(HTMLAttributes.height, getDefaultMediaHeight(mediaType));
    const textWrap = (HTMLAttributes.textWrap || 'break') as MediaEmbedTextWrap;
    const offsetX = normalizeMediaOffset(HTMLAttributes.offsetX);
    const offsetY = normalizeMediaOffset(HTMLAttributes.offsetY);
    const previewUrls = normalizePreviewUrls(HTMLAttributes.previewUrls);
    const previewStatus = typeof HTMLAttributes.previewStatus === 'string' ? HTMLAttributes.previewStatus : null;
    const previewError = typeof HTMLAttributes.previewError === 'string' ? HTMLAttributes.previewError : null;

    if (!src) return ['div', {}];

    const embedSrc = buildEmbedSrc(mediaType, src);
    const useIframe = isIframeEmbed(mediaType, src);

    const wrapperStyleParts: string[] = ['max-width: 100%'];
    if (width !== 'auto') {
      wrapperStyleParts.push(`width: ${width}`);
    }
    if (textWrap === 'left') {
      wrapperStyleParts.push('float: left');
      wrapperStyleParts.push('clear: none');
      wrapperStyleParts.push('margin: 0.35em 1.5em 1em 0');
    } else if (textWrap === 'right') {
      wrapperStyleParts.push('float: right');
      wrapperStyleParts.push('clear: none');
      wrapperStyleParts.push('margin: 0.35em 0 1em 1.5em');
    } else {
      wrapperStyleParts.push('display: block');
      wrapperStyleParts.push('clear: both');
      wrapperStyleParts.push('margin: 1.5em auto');
    }
    if (offsetX !== 0 || offsetY !== 0) {
      wrapperStyleParts.push(`transform: translate(${offsetX}px, ${offsetY}px)`);
    }

    const wrapperAttrs: Record<string, string> = {
      'data-media-embed': 'true',
      'data-media-type': mediaType,
      'data-media-src': src,
      'data-media-width': width,
      'data-media-text-wrap': textWrap,
      'data-media-offset-x': String(offsetX),
      'data-media-offset-y': String(offsetY),
      style: wrapperStyleParts.join('; '),
    };
    if (title) wrapperAttrs['data-media-title'] = title;
    if (height) wrapperAttrs['data-media-height'] = height;
    if (previewUrls.length > 0) wrapperAttrs['data-media-preview-urls'] = JSON.stringify(previewUrls);
    if (previewStatus) wrapperAttrs['data-media-preview-status'] = previewStatus;
    if (previewError) wrapperAttrs['data-media-preview-error'] = previewError;

    const mediaStyleParts = ['width:100%', 'display:block'];
    if (mediaType === 'video') {
      if (height) {
        mediaStyleParts.push(`height:${height}`);
        mediaStyleParts.push('object-fit:contain');
      } else {
        mediaStyleParts.push('aspect-ratio:16 / 9');
        mediaStyleParts.push('height:auto');
      }
    }
    if (mediaType === 'pdf') {
      mediaStyleParts.push(`height:${height ?? getDefaultMediaHeight(mediaType)}`);
    }
    if (mediaType === 'pptx') {
      mediaStyleParts.push(`height:${height ?? getDefaultMediaHeight(mediaType)}`);
    }
    const mediaStyle = mediaStyleParts.join(';');

    if (mediaType === 'pptx' && previewUrls.length > 0) {
      return [
        'div',
        wrapperAttrs,
        [
          'div',
          {
            'data-pptx-preview-viewer': 'true',
            style: 'overflow:hidden;border:1px solid #E5E5E5;border-radius:12px;background:#FFFFFF;',
          },
          [
            'div',
            {
              'data-pptx-preview-frame': 'true',
              style: mediaStyle + ';background:#FFFFFF;display:flex;align-items:center;justify-content:center;',
            },
            [
              'img',
              {
                src: previewUrls[0],
                alt: title || 'PowerPoint slide',
                'data-pptx-preview-image': 'true',
                style: 'display:block;width:100%;height:100%;object-fit:contain;background:#FFFFFF;',
              },
            ],
          ],
          [
            'div',
            {
              'data-pptx-preview-controls': 'true',
              style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px;border-top:1px solid #F0F0F0;',
            },
            [
              'div',
              { style: 'display:flex;align-items:center;gap:8px;' },
              ['button', { type: 'button', 'data-pptx-preview-prev': 'true', style: 'border:1px solid #E5E5E5;border-radius:6px;background:transparent;color:#525252;padding:2px 8px;font-size:12px;font-weight:500;cursor:pointer;' }, 'Prev'],
              ['span', { 'data-pptx-preview-counter': 'true', style: 'font-size:13px;font-weight:500;color:#525252;' }, `1 / ${previewUrls.length}`],
              ['button', { type: 'button', 'data-pptx-preview-next': 'true', style: 'border:1px solid #E5E5E5;border-radius:6px;background:transparent;color:#525252;padding:2px 8px;font-size:12px;font-weight:500;cursor:pointer;' }, 'Next'],
            ],
            [
              'div',
              { style: 'display:flex;align-items:center;gap:8px;' },
              ['a', { href: src, target: '_blank', rel: 'noreferrer', 'data-pptx-download': 'true', style: 'color:#525252;font-size:12px;font-weight:500;text-decoration:none;' }, 'Download'],
              ['button', { type: 'button', 'data-pptx-preview-fullscreen': 'true', style: 'border:1px solid #E5E5E5;border-radius:6px;background:transparent;color:#525252;padding:2px 8px;font-size:12px;font-weight:500;cursor:pointer;' }, 'Fullscreen'],
            ],
          ],
        ],
      ];
    }

    if (mediaType === 'pptx') {
      return [
        'div',
        wrapperAttrs,
        [
          'div',
          {
            style: 'overflow:hidden;border:1px solid #E5E5E5;border-radius:12px;background:#FFFFFF;',
          },
          [
            'div',
            {
              'data-pptx-status': 'true',
              style: 'padding:16px;text-align:center;color:#737373;font-size:14px;',
            },
            'Loading presentation...',
          ],
          [
            'div',
            {
              'data-pptx-viewer-host': 'true',
              hidden: 'true',
              style: 'width:100%;height:auto;min-height:0;background:#FFFFFF;',
            },
          ],
          [
            'div',
            {
              'data-pptx-actions-source': 'true',
              style: 'display:none;',
            },
            [
              'a',
              {
                href: src,
                target: '_blank',
                rel: 'noreferrer',
                'data-pptx-download': 'true',
                style: 'color:#525252;font-size:12px;font-weight:500;text-decoration:none;',
              },
              'Download',
            ],
            [
              'button',
              {
                type: 'button',
                'data-pptx-fullscreen': 'true',
                disabled: 'true',
                style: 'border:1px solid #E5E5E5;border-radius:6px;background:transparent;color:#525252;padding:4px 10px;font-size:12px;font-weight:500;cursor:pointer;',
              },
              'Fullscreen',
            ],
          ],
        ],
      ];
    }

    if (mediaType === 'audio') {
      return ['div', wrapperAttrs, ['audio', { src, controls: '', style: 'width:100%;' }]];
    }

    if (mediaType === 'video' && !useIframe) {
      return ['div', wrapperAttrs, ['video', { src, controls: '', style: mediaStyle }]];
    }

    const iframeStyle = `${mediaStyle};border:none;`;

    return [
      'div',
      wrapperAttrs,
      [
        'iframe',
        {
          src: embedSrc,
          style: iframeStyle,
          allowfullscreen: '',
          loading: 'lazy',
          ...(title ? { title } : {}),
        },
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaEmbedView);
  },

  addCommands() {
    return {
      insertMediaEmbed:
        (options) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: options,
          }),
    };
  },
});
