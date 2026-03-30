import { Extension } from '@tiptap/core';

export interface TextDirectionOptions {
  types: string[];
  directions: string[];
  defaultDirection: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textDirection: {
      setTextDirection: (direction: 'ltr' | 'rtl') => ReturnType;
      unsetTextDirection: () => ReturnType;
    };
  }
}

export const TextDirection = Extension.create<TextDirectionOptions>({
  name: 'textDirection',

  addOptions() {
    return {
      types: ['heading', 'paragraph', 'blockquote', 'listItem'],
      directions: ['ltr', 'rtl', 'auto'],
      defaultDirection: 'ltr',
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: this.options.defaultDirection,
            parseHTML: (element) => element.getAttribute('dir') || this.options.defaultDirection,
            renderHTML: (attributes) => {
              if (attributes.dir === this.options.defaultDirection) {
                return {};
              }
              return { dir: attributes.dir };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextDirection:
        (direction) =>
        ({ commands }) => {
          return this.options.types.every((type) => {
            return commands.updateAttributes(type, { dir: direction });
          });
        },
      unsetTextDirection:
        () =>
        ({ commands }) => {
          return this.options.types.every((type) => {
            return commands.resetAttributes(type, 'dir');
          });
        },
    };
  },
});
