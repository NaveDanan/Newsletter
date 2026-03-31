import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, MinusSignIcon, TableIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface TableMenuProps {
  editor: Editor;
}

export function TableMenu({ editor }: TableMenuProps) {
  const { formatNumber, isRTL, t } = useLocale();
  const [showGrid, setShowGrid] = useState(false);
  const [hoveredCell, setHoveredCell] = useState({ row: 0, col: 0 });

  const insertTable = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setShowGrid(false);
  };

  const isInTable = editor.isActive('table');

  return (
    <div className="relative">
      {/* Main Table Button */}
      <button
        type="button"
        onClick={() => setShowGrid(!showGrid)}
        className={`flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors ${
          isInTable || showGrid ? 'bg-[#D93A3A]/10 text-[#D93A3A]' : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
        }`}
        title={t('editor.table')}
      >
        <HugeiconsIcon icon={TableIcon} className="w-4 h-4" />
        <span className="hidden sm:inline">{t('editor.table')}</span>
      </button>

      {/* Table Menu */}
      {showGrid && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowGrid(false)}
          />
          <div className={cn('absolute top-full mt-2 p-4 bg-white border border-[#E5E5E5] rounded-lg shadow-lg z-50 min-w-[280px]', isRTL ? 'right-0' : 'left-0')}>
            {!isInTable ? (
              // Insert Table Grid
              <div>
                <p className="text-sm text-[#737373] mb-3">{t('editor.insertTable')}</p>
                <div className="grid grid-cols-8 gap-1 mb-3">
                  {Array.from({ length: 64 }, (_, i) => {
                    const row = Math.floor(i / 8) + 1;
                    const col = (i % 8) + 1;
                    const isHovered = row <= hoveredCell.row && col <= hoveredCell.col;
                    
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`w-6 h-6 rounded transition-colors ${
                          isHovered ? 'bg-[#D93A3A]' : 'bg-[#F3F4F6] hover:bg-[#E5E5E5]'
                        }`}
                        onMouseEnter={() => setHoveredCell({ row, col })}
                        onClick={() => insertTable(row, col)}
                      />
                    );
                  })}
                </div>
                <p className="text-sm text-[#171717]">
                  {formatNumber(hoveredCell.row)} × {formatNumber(hoveredCell.col)}
                </p>
              </div>
            ) : (
              // Table Operations
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#171717] mb-3">{t('editor.tableOptions')}</p>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().addColumnBefore().run()}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#171717] hover:bg-[#F3F4F6] rounded transition-colors"
                  >
                    <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
                    {t('editor.columnBefore')}
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().addColumnAfter().run()}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#171717] hover:bg-[#F3F4F6] rounded transition-colors"
                  >
                    <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
                    {t('editor.columnAfter')}
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().addRowBefore().run()}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#171717] hover:bg-[#F3F4F6] rounded transition-colors"
                  >
                    <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
                    {t('editor.rowBefore')}
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#171717] hover:bg-[#F3F4F6] rounded transition-colors"
                  >
                    <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
                    {t('editor.rowAfter')}
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <HugeiconsIcon icon={MinusSignIcon} className="w-4 h-4" />
                    {t('editor.deleteColumn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().deleteRow().run()}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <HugeiconsIcon icon={MinusSignIcon} className="w-4 h-4" />
                    {t('editor.deleteRow')}
                  </button>
                </div>
                
                <div className="border-t border-[#E5E5E5] pt-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().deleteTable().run();
                      setShowGrid(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
                    {t('editor.deleteTable')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
