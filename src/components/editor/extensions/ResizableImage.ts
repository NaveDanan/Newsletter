import { Node, nodeInputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ResizableImageView } from './ResizableImageView';

export interface ResizableImageOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
}

export type ResizableImageTextWrap = 'break' | 'left' | 'right';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setResizableImage: (options: { src: string; alt?: string; title?: string; width?: string; height?: string; rotation?: number; textWrap?: ResizableImageTextWrap }) => ReturnType;
    };
  }
}

export const inputRegex = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:\s+["'](\S+)["'])?\)\s*\{([^}]+)\})$/;

export const ResizableImage = Node.create<ResizableImageOptions>({
  name: 'resizableImage',

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {},
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? 'inline' : 'block';
  },

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: '100%',
      },
      height: {
        default: 'auto',
      },
      rotation: {
        default: 0,
      },
      textWrap: {
        default: 'break',
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) {
            return {};
          }
          return {
            style: attributes.style,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (dom) => {
          if (typeof dom === 'string') return {};
          const element = dom as HTMLImageElement;
          return {
            src: element.getAttribute('src'),
            alt: element.getAttribute('alt'),
            title: element.getAttribute('title'),
            width: element.style.width || element.getAttribute('width') || '100%',
            height: element.style.height || element.getAttribute('height') || 'auto',
            rotation: parseInt(element.getAttribute('data-rotation') || '0'),
            textWrap: element.getAttribute('data-text-wrap') || element.style.float || 'break',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, height, rotation, textWrap, ...attrs } = HTMLAttributes;
    
    const styleParts: string[] = [];
    if (width && width !== 'auto') styleParts.push(`width: ${width}`);
    if (height && height !== 'auto') styleParts.push(`height: ${height}`);
    if (rotation) styleParts.push(`transform: rotate(${rotation}deg)`);
    if (textWrap === 'left') {
      styleParts.push('float: left');
      styleParts.push('margin: 0.35em 1.5em 1em 0');
    } else if (textWrap === 'right') {
      styleParts.push('float: right');
      styleParts.push('margin: 0.35em 0 1em 1.5em');
    } else {
      styleParts.push('display: block');
      styleParts.push('clear: both');
      styleParts.push('margin: 1.5em auto');
    }
    
    return [
      'img',
      {
        ...attrs,
        style: styleParts.join('; '),
        'data-rotation': rotation || '0',
        'data-text-wrap': textWrap || 'break',
      },
    ];
  },

  addCommands() {
    return {
      setResizableImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: inputRegex,
        type: this.type,
        getAttributes: (match) => {
          const [, , alt, src, title, attrs] = match;
          const widthMatch = attrs?.match(/width[:\s]+([^;\s]+)/);
          const heightMatch = attrs?.match(/height[:\s]+([^;\s]+)/);
          const rotationMatch = attrs?.match(/rotation[:\s]+(\d+)/);
          
          return {
            src,
            alt,
            title,
            width: widthMatch?.[1] || '100%',
            height: heightMatch?.[1] || 'auto',
            rotation: parseInt(rotationMatch?.[1] || '0'),
          };
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
