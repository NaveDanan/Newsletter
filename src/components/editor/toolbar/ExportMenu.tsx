import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon, FileAttachmentIcon, FileScriptIcon, PrinterIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface ExportMenuProps {
  editor: Editor;
  title?: string;
}

export function ExportMenu({ editor, title = 'document' }: ExportMenuProps) {
  const { dir, isRTL, locale, t } = useLocale();
  const [showMenu, setShowMenu] = useState(false);
  const resolvedTitle = title || t('editor.document');

  const exportHTML = () => {
    const html = editor.getHTML();
    const blob = new Blob([`
<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${resolvedTitle}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px; 
      margin: 40px auto; 
      padding: 20px;
      line-height: 1.6;
      color: #333;
      direction: ${dir};
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    blockquote { 
      border-left: 4px solid #D93A3A; 
      margin: 1em 0; 
      padding-left: 1em; 
      color: #666; 
    }
    code { 
      background: #f4f4f4; 
      padding: 2px 6px; 
      border-radius: 3px; 
      font-family: monospace; 
    }
    pre { 
      background: #1a1a1a; 
      color: #fff; 
      padding: 16px; 
      border-radius: 8px; 
      overflow-x: auto; 
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>
    `], { type: 'text/html' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resolvedTitle.replace(/\s+/g, '_').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(t('editor.htmlExported'));
    setShowMenu(false);
  };

  const exportText = () => {
    const text = editor.getText();
    const blob = new Blob([text], { type: 'text/plain' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resolvedTitle.replace(/\s+/g, '_').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(t('editor.textExported'));
    setShowMenu(false);
  };

  const exportJSON = () => {
    const json = JSON.stringify(editor.getJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resolvedTitle.replace(/\s+/g, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(t('editor.jsonExported'));
    setShowMenu(false);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${resolvedTitle}</title>
  <style>
    @media print {
      body { 
        font-family: Georgia, serif;
        font-size: 12pt;
        line-height: 1.5;
        color: #000;
      }
      img { max-width: 100%; height: auto; page-break-inside: avoid; }
      table { page-break-inside: avoid; }
      h1, h2, h3 { page-break-after: avoid; }
      p { orphans: 3; widows: 3; }
    }
    body { 
      font-family: Georgia, serif;
      max-width: 800px; 
      margin: 40px auto; 
      padding: 20px;
      line-height: 1.6;
      direction: ${dir};
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #333; padding: 8px; text-align: left; }
    th { background-color: #f0f0f0; font-weight: bold; }
    blockquote { 
      border-left: 3px solid #333; 
      margin: 1em 0; 
      padding-left: 1em; 
      font-style: italic;
    }
    code { 
      background: #f4f4f4; 
      padding: 2px 6px; 
      border-radius: 3px; 
      font-family: monospace; 
      font-size: 0.9em;
    }
    pre { 
      background: #f4f4f4; 
      padding: 16px; 
      border-radius: 4px; 
      overflow-x: auto; 
      font-size: 0.9em;
    }
    h1 { font-size: 2em; margin-bottom: 0.5em; }
    h2 { font-size: 1.5em; margin-top: 1em; margin-bottom: 0.5em; }
    h3 { font-size: 1.25em; margin-top: 1em; margin-bottom: 0.5em; }
  </style>
</head>
<body>
  ${editor.getHTML()}
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>
      `);
      printWindow.document.close();
    }
    setShowMenu(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-1 px-2 py-1.5 text-sm text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717] rounded transition-colors"
        title={t('editor.export')}
      >
        <HugeiconsIcon icon={Download01Icon} className="w-4 h-4" />
        <span className="hidden sm:inline">{t('editor.export')}</span>
      </button>

      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)}
          />
          <div className={cn('absolute top-full mt-2 w-48 bg-white border border-[#E5E5E5] rounded-lg shadow-lg z-50 py-1', isRTL ? 'left-0' : 'right-0')} dir={dir}>
            <button
              type="button"
              onClick={exportHTML}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#171717] hover:bg-[#F3F4F6] transition-colors"
            >
              <HugeiconsIcon icon={FileScriptIcon} className="w-4 h-4 text-[#737373]" />
              {t('editor.exportHtml')}
            </button>
            <button
              type="button"
              onClick={exportText}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#171717] hover:bg-[#F3F4F6] transition-colors"
            >
              <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4 text-[#737373]" />
              {t('editor.exportText')}
            </button>
            <button
              type="button"
              onClick={exportJSON}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#171717] hover:bg-[#F3F4F6] transition-colors"
            >
              <HugeiconsIcon icon={FileScriptIcon} className="w-4 h-4 text-[#737373]" />
              {t('editor.exportJson')}
            </button>
            <div className="border-t border-[#E5E5E5] my-1" />
            <button
              type="button"
              onClick={handlePrint}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#171717] hover:bg-[#F3F4F6] transition-colors"
            >
              <HugeiconsIcon icon={PrinterIcon} className="w-4 h-4 text-[#737373]" />
              {t('editor.print')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
