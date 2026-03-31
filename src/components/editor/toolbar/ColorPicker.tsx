import { HugeiconsIcon } from "@hugeicons/react";
import { HighlighterIcon, TextIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  editor: Editor;
}

const textColors = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF', '#9900FF', '#FF00FF',
  '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
  '#DD7E6B', '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#A4C2F4', '#9FC5E8', '#B4A7D6', '#D5A6BD',
];

const highlightColors = [
  '#FFFF00', '#00FFFF', '#00FF00', '#FF00FF', '#FF0000', '#0000FF', '#FFA500', '#800080',
  '#FFC0CB', '#90EE90', '#87CEEB', '#DDA0DD', '#F0E68C', '#FFB6C1', '#98FB98', '#B0E0E6',
];

export function ColorPicker({ editor }: ColorPickerProps) {
  const { isRTL, t } = useLocale();
  const [activeTab, setActiveTab] = useState<'text' | 'highlight'>('text');
  const [showPicker, setShowPicker] = useState(false);

  const currentTextColor = editor.getAttributes('textStyle').color || '#000000';
  const currentHighlightColor = editor.getAttributes('highlight')?.color || 'transparent';

  const handleColorSelect = (color: string) => {
    if (activeTab === 'text') {
      editor.chain().focus().setColor(color).run();
    } else {
      if (color === 'transparent') {
        editor.chain().focus().unsetHighlight().run();
      } else {
        editor.chain().focus().setHighlight({ color }).run();
      }
    }
    setShowPicker(false);
  };

  return (
    <div className="relative">
      {/* Text Color Button */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => {
            setActiveTab('text');
            setShowPicker(!showPicker);
          }}
          className={`flex items-center gap-1 px-2 py-1.5 text-sm hover:bg-[#F3F4F6] rounded-l transition-colors ${
            showPicker && activeTab === 'text' ? 'bg-[#F3F4F6]' : ''
          }`}
          title={t('editor.textColor')}
        >
          <HugeiconsIcon icon={TextIcon} className="w-4 h-4" style={{ color: currentTextColor }} />
          <div 
            className="w-4 h-1 rounded-sm mt-1" 
            style={{ backgroundColor: currentTextColor }}
          />
        </button>
        
        {/* Highlight Button */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('highlight');
            setShowPicker(!showPicker);
          }}
          className={`flex items-center gap-1 px-2 py-1.5 text-sm hover:bg-[#F3F4F6] rounded-r transition-colors ${
            showPicker && activeTab === 'highlight' ? 'bg-[#F3F4F6]' : ''
          }`}
          title={t('editor.highlightColor')}
        >
          <HugeiconsIcon icon={HighlighterIcon} className="w-4 h-4" />
          <div 
            className="w-4 h-1 rounded-sm mt-1" 
            style={{ backgroundColor: currentHighlightColor === 'transparent' ? '#E5E5E5' : currentHighlightColor }}
          />
        </button>
      </div>

      {/* Color Picker Popup */}
      {showPicker && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowPicker(false)}
          />
          <div className={cn('absolute top-full mt-2 p-3 bg-white border border-[#E5E5E5] rounded-lg shadow-lg z-50 w-64', isRTL ? 'right-0' : 'left-0')}>
            {/* Tabs */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`flex-1 py-1.5 px-3 text-sm rounded-lg transition-colors ${
                  activeTab === 'text' 
                    ? 'bg-[#D93A3A] text-white' 
                    : 'bg-[#F3F4F6] text-[#737373] hover:bg-[#E5E5E5]'
                }`}
              >
                {t('editor.text')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('highlight')}
                className={`flex-1 py-1.5 px-3 text-sm rounded-lg transition-colors ${
                  activeTab === 'highlight' 
                    ? 'bg-[#D93A3A] text-white' 
                    : 'bg-[#F3F4F6] text-[#737373] hover:bg-[#E5E5E5]'
                }`}
              >
                {t('editor.highlight')}
              </button>
            </div>

            {/* Colors Grid */}
            <div className="grid grid-cols-10 gap-1">
              {(activeTab === 'text' ? textColors : highlightColors).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleColorSelect(color)}
                  className="w-5 h-5 rounded border border-[#E5E5E5] hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {/* No Color Option for highlight */}
            {activeTab === 'highlight' && (
              <button
                type="button"
                onClick={() => handleColorSelect('transparent')}
                className="mt-3 w-full py-1.5 text-sm text-[#737373] hover:bg-[#F3F4F6] rounded transition-colors border border-dashed border-[#E5E5E5]"
              >
                {t('editor.noHighlight')}
              </button>
            )}

            {/* Custom Color Input */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-[#737373]">{t('editor.customColor')}</span>
              <input
                type="color"
                onChange={(e) => handleColorSelect(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-[#E5E5E5]"
                defaultValue={activeTab === 'text' ? currentTextColor : '#FFFF00'}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
