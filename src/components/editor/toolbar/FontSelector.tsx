import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import type { Editor } from '@tiptap/react';

interface FontSelectorProps {
  editor: Editor;
}

const fonts = [
  { name: 'Default', value: '' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { name: 'Courier New', value: '"Courier New", Courier, monospace' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { name: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { name: 'Palatino', value: 'Palatino, serif' },
  { name: 'Garamond', value: 'Garamond, serif' },
  { name: 'Bookman', value: 'Bookman, serif' },
  { name: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
  { name: 'Impact', value: 'Impact, sans-serif' },
];

export function FontSelector({ editor }: FontSelectorProps) {
  const currentFont = editor.getAttributes('textStyle').fontFamily || '';
  
  const currentFontName = fonts.find(f => f.value === currentFont)?.name || 'Default';

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1.5 text-sm text-[#171717] hover:bg-[#F3F4F6] rounded transition-colors min-w-[120px]"
      >
        <span className="truncate">{currentFontName}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="w-3 h-3 text-[#737373]" />
      </button>
      
      <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-[#E5E5E5] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 max-h-64 overflow-y-auto">
        {fonts.map((font) => (
          <button
            key={font.name}
            type="button"
            onClick={() => {
              if (font.value) {
                editor.chain().focus().setFontFamily(font.value).run();
              } else {
                editor.chain().focus().unsetFontFamily().run();
              }
            }}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F3F4F6] transition-colors first:rounded-t-lg last:rounded-b-lg ${
              currentFont === font.value ? 'bg-[#D93A3A]/10 text-[#D93A3A]' : 'text-[#171717]'
            }`}
            style={{ fontFamily: font.value || 'inherit' }}
          >
            {font.name}
          </button>
        ))}
      </div>
    </div>
  );
}
