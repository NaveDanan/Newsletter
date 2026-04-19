import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MediaEmbedView } from './MediaEmbedView';

export type MediaEmbedType = 'video' | 'audio' | 'pdf' | 'pptx';
export type MediaEmbedTextWrap = 'break' | 'left' | 'right';

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
  return mediaType === 'video' || mediaType === 'pdf';
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

    if (mediaType === 'pptx') {
      return [
        'div',
        wrapperAttrs,
        [
          'div',
          {
            style: 'overflow:hidden;border:1px solid #E5E5E5;border-radius:16px;background:#FFFFFF;',
          },
          [
            'div',
            {
              style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #E5E5E5;background:#FAFAFA;',
            },
            [
              'div',
              {
                style: 'display:flex;min-width:0;align-items:center;gap:8px;color:#525252;font-size:14px;font-weight:600;',
              },
              title ?? 'PowerPoint presentation',
            ],
            [
              'button',
              {
                type: 'button',
                'data-pptx-fullscreen': 'true',
                disabled: 'true',
                style: 'border:1px solid #D4D4D4;border-radius:999px;background:#FFFFFF;color:#171717;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;',
              },
              'Fullscreen',
            ],
          ],
          [
            'div',
            {
              'data-pptx-status': 'true',
              style: 'padding:16px;color:#737373;font-size:14px;',
            },
            'Loading presentation...',
          ],
          [
            'div',
            {
              'data-pptx-viewer-host': 'true',
              hidden: 'true',
              style: `${mediaStyle};background:#FFFFFF;`,
            },
          ],
          [
            'div',
            {
              style: 'padding:0 16px 16px;',
            },
            [
              'a',
              {
                href: src,
                target: '_blank',
                rel: 'noreferrer',
                'data-pptx-download': 'true',
                style: 'color:#D93A3A;font-size:13px;font-weight:600;text-decoration:none;',
              },
              'Download presentation',
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
