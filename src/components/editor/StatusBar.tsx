import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, FileAttachmentIcon, Maximize02Icon, Minimize02Icon, TextIcon } from "@hugeicons/core-free-icons";
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/contexts/LocaleContext';

interface StatusBarProps {
  editor: Editor;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function StatusBar({ editor, isFullscreen, onToggleFullscreen }: StatusBarProps) {
  const { formatNumber, t } = useLocale();
  const text = editor.getText();
  
  // Statistics
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCountNoSpaces = text.replace(/\s/g, '').length;
  const paragraphCount = editor.getJSON().content?.filter((node) => 
    node.type === 'paragraph' || node.type === 'heading'
  ).length || 0;
  
  // Estimated read time (average 200 words per minute)
  const readTimeMinutes = Math.ceil(wordCount / 200);
  const readTime = readTimeMinutes < 1 ? t('editor.readTimeUnderMinute') : t('editor.readTimeMinutes', { count: formatNumber(readTimeMinutes) });

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#F9FAFB] border-t border-[#E5E5E5] text-sm">
      {/* Left: Statistics */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[#737373]" title={t('editor.wordCount')}>
          <HugeiconsIcon icon={TextIcon} className="w-4 h-4" />
          <span>{t('editor.wordsCount', { count: formatNumber(wordCount) })}</span>
        </div>
        
        <div className="flex items-center gap-1.5 text-[#737373]" title={t('editor.characterCount')}>
          <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4" />
          <span>{t('editor.charactersCount', { count: formatNumber(charCountNoSpaces) })}</span>
        </div>
        
        <div className="hidden sm:flex items-center gap-1.5 text-[#737373]" title={t('editor.readingTime')}>
          <HugeiconsIcon icon={Clock01Icon} className="w-4 h-4" />
          <span>{t('editor.readLabel', { time: readTime })}</span>
        </div>
        
        <div className="hidden md:flex items-center gap-1.5 text-[#737373]">
          <span className="text-[#A3A3A3]">|</span>
          <span>{t('editor.paragraphsCount', { count: formatNumber(paragraphCount) })}</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleFullscreen}
          className="flex items-center gap-1.5 px-2 py-1 text-[#737373] hover:text-[#171717] hover:bg-[#E5E5E5] rounded transition-colors"
          title={isFullscreen ? t('editor.exitFullscreen') : t('editor.fullscreenMode')}
        >
          {isFullscreen ? (
            <>
              <HugeiconsIcon icon={Minimize02Icon} className="w-4 h-4" />
              <span className="hidden sm:inline">{t('editor.exitFullscreenLabel')}</span>
            </>
          ) : (
            <>
              <HugeiconsIcon icon={Maximize02Icon} className="w-4 h-4" />
              <span className="hidden sm:inline">{t('editor.fullscreenLabel')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
