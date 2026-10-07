import { Color } from '@tiptap/extension-color';
import { isDarkNeutralTextColor } from '@/lib/newsletter-text-color';

// Keep the saved color and ColorPicker commands intact. The extra HTML
// attribute lets CSS adapt neutral text without rewriting the document.
export const ThemeAwareColor = Color.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map((group) => ({
      ...group,
      attributes: {
        ...group.attributes,
        color: {
          ...group.attributes.color,
          renderHTML: (attributes: Record<string, unknown>) => {
            const rendered = group.attributes.color?.renderHTML?.(attributes) ?? {};
            if (!isDarkNeutralTextColor(attributes.color)) return rendered;
            return {
              ...rendered,
              style: `${rendered.style}; --newsletter-original-text-color: ${attributes.color}`,
              'data-theme-text': 'neutral',
            };
          },
        },
      },
    }));
  },
});
