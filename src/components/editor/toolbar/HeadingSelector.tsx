import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Heading01Icon, Heading02Icon, Heading03Icon, Heading04Icon, Heading05Icon, Heading06Icon, TextIcon } from "@hugeicons/core-free-icons";
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface HeadingSelectorProps {
  editor: Editor;
}

export function HeadingSelector({ editor }: HeadingSelectorProps) {
  const { isRTL, t } = useLocale();
  const headings = [
    { name: t('editor.normalText'), level: 0, icon: TextIcon },
    { name: t('editor.heading1'), level: 1, icon: Heading01Icon },
    { name: t('editor.heading2'), level: 2, icon: Heading02Icon },
    { name: t('editor.heading3'), level: 3, icon: Heading03Icon },
    { name: t('editor.heading4'), level: 4, icon: Heading04Icon },
    { name: t('editor.heading5'), level: 5, icon: Heading05Icon },
    { name: t('editor.heading6'), level: 6, icon: Heading06Icon },
  ] as const;
  const getCurrentHeading = () => {
    for (let i = 1; i <= 6; i++) {
      if (editor.isActive('heading', { level: i })) {
        return headings.find(h => h.level === i);
      }
    }
    return headings[0];
  };

  const currentHeading = getCurrentHeading();
  const Icon = currentHeading?.icon || TextIcon;

  const setHeading = (level: number) => {
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
    }
  };

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1.5 text-sm text-[#171717] hover:bg-[#F3F4F6] rounded transition-colors min-w-[100px]"
      >
        <HugeiconsIcon icon={Icon} className="w-4 h-4" />
        <span className="truncate">{currentHeading?.name}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="w-3 h-3 text-[#737373]" />
      </button>
      
      <div className={cn('absolute top-full mt-1 w-40 bg-white border border-[#E5E5E5] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50', isRTL ? 'right-0' : 'left-0')}>
        {headings.map((heading) => {
          const HeadingIcon = heading.icon;
          const isActive = heading.level === 0 
            ? editor.isActive('paragraph') && !editor.isActive('heading')
            : editor.isActive('heading', { level: heading.level });
          
          return (
            <button
              key={heading.level}
              type="button"
              onClick={() => setHeading(heading.level)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#F3F4F6] transition-colors first:rounded-t-lg last:rounded-b-lg ${
                isActive ? 'bg-[#D93A3A]/10 text-[#D93A3A]' : 'text-[#171717]'
              }`}
              style={{ 
                fontWeight: heading.level === 0 ? 'normal' : 'bold',
                fontSize: heading.level === 0 ? '1em' : `${1.5 - heading.level * 0.1}em`
              }}
            >
              <HugeiconsIcon icon={HeadingIcon} className="w-4 h-4 flex-shrink-0" />
              <span>{heading.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
