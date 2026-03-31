import { HugeiconsIcon } from "@hugeicons/react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "@hugeicons/core-free-icons";
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/contexts/LocaleContext';

interface AlignmentSelectorProps {
  editor: Editor;
}

const alignments = [
  { name: 'left', icon: AlignLeft, value: 'left' },
  { name: 'center', icon: AlignCenter, value: 'center' },
  { name: 'right', icon: AlignRight, value: 'right' },
  { name: 'justify', icon: AlignJustify, value: 'justify' },
] as const;

export function AlignmentSelector({ editor }: AlignmentSelectorProps) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-0.5">
      {alignments.map(({ name, icon: Icon, value }) => (
        <button
          key={name}
          type="button"
          onClick={() => editor.chain().focus().setTextAlign(value).run()}
          className={`p-1.5 rounded transition-colors ${
            editor.isActive({ textAlign: value })
              ? 'bg-[#D93A3A] text-white'
              : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
          }`}
          title={name === 'left' ? t('editor.alignLeft') : name === 'center' ? t('editor.alignCenter') : name === 'right' ? t('editor.alignRight') : t('editor.alignJustify')}
        >
          <HugeiconsIcon icon={Icon} className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
