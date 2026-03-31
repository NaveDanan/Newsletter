import { HugeiconsIcon } from "@hugeicons/react";
import { GlobeIcon, TextAlignLeftIcon, TextAlignRightIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface TextDirectionSelectorProps {
  editor: Editor;
}

export function TextDirectionSelector({ editor }: TextDirectionSelectorProps) {
  const { isRTL, t } = useLocale();
  const [showMenu, setShowMenu] = useState(false);

  const setDirection = (direction: 'ltr' | 'rtl') => {
    const { from, to } = editor.state.selection;
    
    // Check if there's a selection
    if (from !== to) {
      // Apply direction to selected nodes
      editor.chain().focus().setTextDirection(direction).run();
    } else {
      // Apply to entire document by selecting all and applying
      editor.chain().focus().selectAll().setTextDirection(direction).run();
      // Move cursor to end
      editor.chain().focus().setTextSelection(editor.state.doc.content.size - 1).run();
    }
    
    setShowMenu(false);
  };

  const getCurrentDirection = () => {
    const { from } = editor.state.selection;
    const node = editor.state.doc.nodeAt(from);
    if (node && node.attrs.dir) {
      return node.attrs.dir;
    }
    
    // Check the parent node's direction
    const $pos = editor.state.doc.resolve(from);
    const parentNode = $pos.parent;
    if (parentNode && parentNode.attrs.dir) {
      return parentNode.attrs.dir;
    }
    
    return isRTL ? 'rtl' : 'ltr';
  };

  const currentDirection = getCurrentDirection();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className={`flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors ${
          showMenu ? 'bg-[#D93A3A]/10 text-[#D93A3A]' : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
        }`}
        title={t('editor.textDirection')}
      >
        <HugeiconsIcon icon={GlobeIcon} className="w-4 h-4" />
        <span className="hidden sm:inline uppercase text-xs font-medium">
          {currentDirection === 'rtl' ? 'RTL' : 'LTR'}
        </span>
      </button>

      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)}
          />
          <div className={cn('absolute top-full mt-2 w-48 bg-white border border-[#E5E5E5] rounded-lg shadow-lg z-50 py-1', isRTL ? 'right-0' : 'left-0')}>
            <div className="px-3 py-2 text-xs text-[#737373] uppercase tracking-wider border-b border-[#E5E5E5]">
              {t('editor.textDirection')}
            </div>
            
            <button
              type="button"
              onClick={() => setDirection('ltr')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                currentDirection === 'ltr' 
                  ? 'bg-[#D93A3A]/10 text-[#D93A3A]' 
                  : 'text-[#171717] hover:bg-[#F3F4F6]'
              }`}
            >
              <HugeiconsIcon icon={TextAlignLeftIcon} className="w-4 h-4" />
              <span className="flex-1 text-left">{t('editor.leftToRight')}</span>
              {currentDirection === 'ltr' && (
                <span className="text-xs bg-[#D93A3A] text-white px-1.5 py-0.5 rounded">LTR</span>
              )}
            </button>
            
            <button
              type="button"
              onClick={() => setDirection('rtl')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                currentDirection === 'rtl' 
                  ? 'bg-[#D93A3A]/10 text-[#D93A3A]' 
                  : 'text-[#171717] hover:bg-[#F3F4F6]'
              }`}
            >
              <HugeiconsIcon icon={TextAlignRightIcon} className="w-4 h-4" />
              <span className="flex-1 text-left">{t('editor.rightToLeft')}</span>
              {currentDirection === 'rtl' && (
                <span className="text-xs bg-[#D93A3A] text-white px-1.5 py-0.5 rounded">RTL</span>
              )}
            </button>
            
            <div className="px-4 py-2 text-xs text-[#A3A3A3] border-t border-[#E5E5E5]">
              {editor.state.selection.from !== editor.state.selection.to 
                ? t('editor.appliesSelection') 
                : t('editor.appliesDocument')}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
