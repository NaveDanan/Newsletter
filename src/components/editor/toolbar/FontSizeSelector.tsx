import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface FontSizeSelectorProps {
  editor: Editor;
}

const fontSizes = [
  { name: '8pt', value: '8px' },
  { name: '9pt', value: '9px' },
  { name: '10pt', value: '10px' },
  { name: '11pt', value: '11px' },
  { name: '12pt', value: '12px' },
  { name: '14pt', value: '14px' },
  { name: '16pt', value: '16px' },
  { name: '18pt', value: '18px' },
  { name: '20pt', value: '20px' },
  { name: '22pt', value: '22px' },
  { name: '24pt', value: '24px' },
  { name: '26pt', value: '26px' },
  { name: '28pt', value: '28px' },
  { name: '36pt', value: '36px' },
  { name: '48pt', value: '48px' },
  { name: '72pt', value: '72px' },
];

export function FontSizeSelector({ editor }: FontSizeSelectorProps) {
  const { isRTL } = useLocale();
  const getCurrentFontSize = () => {
    const attrs = editor.getAttributes('textStyle');
    if (attrs.fontSize) return attrs.fontSize;
    
    // Try to get computed style
    const { from, to } = editor.state.selection;
    if (from === to) {
      const node = editor.view.domAtPos(from).node as HTMLElement;
      if (node && node.style) {
        return node.style.fontSize || '16px';
      }
    }
    return '16px';
  };

  const currentSize = getCurrentFontSize();
  const currentSizeName = fontSizes.find(s => s.value === currentSize)?.name || '16pt';

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1.5 text-sm text-[#171717] hover:bg-[#F3F4F6] rounded transition-colors min-w-[60px]"
      >
        <span>{currentSizeName}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="w-3 h-3 text-[#737373]" />
      </button>
      
      <div className={cn('absolute top-full mt-1 w-20 bg-white border border-[#E5E5E5] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 max-h-64 overflow-y-auto', isRTL ? 'right-0' : 'left-0')}>
        {fontSizes.map((size) => (
          <button
            key={size.value}
            type="button"
            onClick={() => editor.chain().focus().setFontSize(size.value).run()}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#F3F4F6] transition-colors first:rounded-t-lg last:rounded-b-lg ${
              currentSize === size.value ? 'bg-[#D93A3A]/10 text-[#D93A3A]' : 'text-[#171717]'
            }`}
          >
            {size.name}
          </button>
        ))}
      </div>
    </div>
  );
}
