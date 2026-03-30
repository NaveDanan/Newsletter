import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, ReplaceAllIcon, ReplaceIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { useState, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/react';

interface FindReplaceDialogProps {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
}

export function FindReplaceDialog({ editor, isOpen, onClose }: FindReplaceDialogProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);

  // Count matches
  const countMatches = useCallback(() => {
    if (!findText) {
      setTotalMatches(0);
      setCurrentMatch(0);
      return;
    }

    const content = editor.getText();
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const matches = content.match(regex);
    setTotalMatches(matches ? matches.length : 0);
  }, [editor, findText, matchCase]);

  useEffect(() => {
    countMatches();
  }, [countMatches]);

  // Find next
  const findNext = useCallback(() => {
    if (!findText) return;
    
    const { state } = editor;
    const { from } = state.selection;
    const content = editor.getText();
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    
    let match;
    let matchIndex = -1;
    regex.lastIndex = from;
    
    while ((match = regex.exec(content)) !== null) {
      matchIndex = match.index;
      break;
    }
    
    // If not found after cursor, search from beginning
    if (matchIndex === -1) {
      regex.lastIndex = 0;
      while ((match = regex.exec(content)) !== null) {
        matchIndex = match.index;
        break;
      }
    }
    
    if (matchIndex !== -1) {
      const matchEnd = matchIndex + findText.length;
      editor.chain().focus().setTextSelection({ from: matchIndex + 1, to: matchEnd + 1 }).run();
      setCurrentMatch((prev) => (prev % totalMatches) + 1);
    }
  }, [editor, findText, matchCase, totalMatches]);

  // Find previous
  const findPrevious = useCallback(() => {
    if (!findText) return;
    
    const { state } = editor;
    const { from } = state.selection;
    const content = editor.getText();
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    
    const matches: { index: number; length: number }[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      matches.push({ index: match.index, length: match[0].length });
    }
    
    // Find the match before current position
    const currentFrom = from - 1;
    let prevMatch = matches.reverse().find(m => m.index < currentFrom);
    
    // If not found, go to last match
    if (!prevMatch && matches.length > 0) {
      prevMatch = matches[matches.length - 1];
    }
    
    if (prevMatch) {
      editor.chain().focus().setTextSelection({ 
        from: prevMatch.index + 1, 
        to: prevMatch.index + prevMatch.length + 1 
      }).run();
      setCurrentMatch((prev) => (prev <= 1 ? totalMatches : prev - 1));
    }
  }, [editor, findText, matchCase, totalMatches]);

  // Replace current
  const replaceCurrent = useCallback(() => {
    const { state } = editor;
    const { from, to } = state.selection;
    
    if (from !== to) {
      const selectedText = state.doc.textBetween(from, to);
      const shouldReplace = matchCase 
        ? selectedText === findText 
        : selectedText.toLowerCase() === findText.toLowerCase();
      
      if (shouldReplace) {
        editor.chain().focus().insertContent(replaceText).run();
        countMatches();
      }
    }
    findNext();
  }, [editor, findText, replaceText, matchCase, findNext, countMatches]);

  // Replace all
  const replaceAll = useCallback(() => {
    const content = editor.getHTML();
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const newContent = content.replace(regex, replaceText);
    editor.chain().focus().setContent(newContent).run();
    countMatches();
  }, [editor, findText, replaceText, matchCase, countMatches]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        findPrevious();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        findNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, findNext, findPrevious]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20">
      <div className="bg-white rounded-xl shadow-2xl border border-[#E5E5E5] w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Search01Icon} className="w-5 h-5 text-[#D93A3A]" />
            <h3 className="font-semibold text-[#171717]">Find and Replace</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Find Input */}
          <div>
            <label className="block text-sm font-medium text-[#737373] mb-1.5">
              Find
            </label>
            <div className="relative">
              <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
              <input
                type="text"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="Search for..."
                className="w-full pl-10 pr-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D93A3A]/20 focus:border-[#D93A3A]"
                autoFocus
              />
            </div>
          </div>

          {/* Replace Input */}
          <div>
            <label className="block text-sm font-medium text-[#737373] mb-1.5">
              Replace with
            </label>
            <div className="relative">
              <HugeiconsIcon icon={ReplaceIcon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace with..."
                className="w-full pl-10 pr-4 py-2 border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D93A3A]/20 focus:border-[#D93A3A]"
              />
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="w-4 h-4 rounded border-[#E5E5E5] text-[#D93A3A] focus:ring-[#D93A3A]"
              />
              <span className="text-sm text-[#737373]">Match case</span>
            </label>
            
            {totalMatches > 0 && (
              <span className="text-sm text-[#737373] ml-auto">
                {currentMatch} of {totalMatches} matches
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              onClick={findPrevious}
              disabled={!findText}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-[#F3F4F6] text-[#171717] rounded-lg hover:bg-[#E5E5E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={findNext}
              disabled={!findText}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-[#F3F4F6] text-[#171717] rounded-lg hover:bg-[#E5E5E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <HugeiconsIcon icon={ArrowDown01Icon} className="w-4 h-4" />
              Next
            </button>
            <div className="flex-1" />
            <button
              onClick={replaceCurrent}
              disabled={!findText}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-[#D93A3A] text-white rounded-lg hover:bg-[#B91C1C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <HugeiconsIcon icon={ReplaceIcon} className="w-4 h-4" />
              Replace
            </button>
            <button
              onClick={replaceAll}
              disabled={!findText}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-[#171717] text-white rounded-lg hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <HugeiconsIcon icon={ReplaceAllIcon} className="w-4 h-4" />
              Replace All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
