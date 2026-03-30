import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { ArrowDown01Icon, CheckmarkSquare01Icon, CodeIcon, FolderOpenIcon, GlobeIcon, Image01Icon, LeftToRightListNumberIcon, Link01Icon, List, MinusSignIcon, QuoteUpIcon, RedoIcon, Search01Icon, TextBoldIcon, TextClearIcon, TextItalicIcon, TextStrikethroughIcon, TextSubscriptIcon, TextSuperscriptIcon, TextUnderlineIcon, UndoIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ResizableImage } from './extensions/ResizableImage';
import { TextDirection } from './extensions/TextDirection';
import { FontSelector } from './toolbar/FontSelector';
import { FontSizeSelector } from './toolbar/FontSizeSelector';
import { ColorPicker } from './toolbar/ColorPicker';
import { AlignmentSelector } from './toolbar/AlignmentSelector';
import { TextDirectionSelector } from './toolbar/TextDirectionSelector';
import { TableMenu } from './toolbar/TableMenu';
import { HeadingSelector } from './toolbar/HeadingSelector';
import { ExportMenu } from './toolbar/ExportMenu';
import { FindReplaceDialog } from './FindReplaceDialog';
import { StatusBar } from './StatusBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface AdvancedEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  title?: string;
}

export interface AdvancedEditorHandle {
  getHTML: () => string;
}

export const AdvancedEditor = forwardRef<AdvancedEditorHandle, AdvancedEditorProps>(function AdvancedEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
  title,
}, ref) {
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      ResizableImage.configure({
        allowBase64: true,
        inline: false,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      FontFamily,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Subscript,
      Superscript,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CharacterCount,
      Typography,
      TextDirection.configure({
        types: ['heading', 'paragraph', 'blockquote', 'listItem'],
        defaultDirection: 'ltr',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() ?? content,
  }), [content, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Process and upload image file
  const processImageFile = useCallback((file: File) => {
    if (!editor) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        editor.chain().focus().setResizableImage({
          src: result,
          alt: file.name,
          width: '100%',
          height: 'auto',
          textWrap: 'break',
        }).run();
        toast.success('Image inserted successfully');
      }
    };
    reader.onerror = () => toast.error('Failed to read image file');
    reader.readAsDataURL(file);
  }, [editor]);

  const addImageByUrl = useCallback(() => {
    if (!editor) {
      return;
    }

    const url = window.prompt('Enter image URL');
    if (url) {
      editor.chain().focus().setResizableImage({
        src: url,
        width: '100%',
        height: 'auto',
        textWrap: 'break',
      }).run();
    }
  }, [editor]);

  const addImageByFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(processImageFile);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processImageFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(file => {
      if (file.type.startsWith('image/')) processImageFile(file);
    });
  }, [processImageFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    Array.from(e.clipboardData?.items || []).forEach(item => {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          processImageFile(file);
        }
      }
    });
  }, [processImageFile]);

  const addLink = useCallback(() => {
    if (!editor) {
      return;
    }

    const url = window.prompt('Enter URL');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const clearFormatting = useCallback(() => {
    if (!editor) {
      return;
    }

    editor.chain().focus().clearNodes().unsetAllMarks().run();
    toast.success('Formatting cleared');
  }, [editor]);

  const ToolbarButton = ({ 
    onClick, 
    active = false, 
    icon: Icon,
    title,
    disabled = false,
  }: { 
    onClick: () => void; 
    active?: boolean; 
    icon: IconSvgElement;
    title: string;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active 
          ? 'bg-[#D93A3A] text-white' 
          : disabled
            ? 'text-[#D4D4D4] cursor-not-allowed'
            : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
      }`}
    >
      <HugeiconsIcon icon={Icon} className="w-4 h-4" />
    </button>
  );

  const Divider = () => <div className="w-px h-5 bg-[#E5E5E5] mx-1" />;

  const editorContainerClass = isFullscreen 
    ? 'fixed inset-0 z-50 bg-white flex flex-col' 
    : 'border border-[#E5E5E5] rounded-xl overflow-hidden bg-white flex flex-col';

  if (!editor) {
    return null;
  }

  return (
    <div className={editorContainerClass}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <FindReplaceDialog 
        editor={editor} 
        isOpen={showFindReplace} 
        onClose={() => setShowFindReplace(false)} 
      />

      {/* Main Toolbar */}
      <div className="border-b border-[#E5E5E5] bg-[#FAFAFA]">
        {/* Top Row - File Operations */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[#E5E5E5]">
          <ExportMenu editor={editor} title={title} />
          <Divider />
          <ToolbarButton
            onClick={() => setShowFindReplace(true)}
            icon={Search01Icon}
            title="Find and Replace (Ctrl+F)"
          />
          <div className="flex-1" />
          <ToolbarButton
            onClick={clearFormatting}
            icon={TextClearIcon}
            title="Clear formatting"
          />
        </div>

        {/* Second Row - Font & Size */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E5E5E5] flex-wrap">
          <HeadingSelector editor={editor} />
          <Divider />
          <FontSelector editor={editor} />
          <FontSizeSelector editor={editor} />
          <Divider />
          <ColorPicker editor={editor} />
        </div>

        {/* Third Row - Formatting */}
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-[#E5E5E5] flex-wrap">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            icon={TextBoldIcon}
            title="Bold (Ctrl+B)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            icon={TextItalicIcon}
            title="Italic (Ctrl+I)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            icon={TextUnderlineIcon}
            title="Underline (Ctrl+U)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            icon={TextStrikethroughIcon}
            title="Strikethrough"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            icon={CodeIcon}
            title="Inline code"
          />
          <Divider />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            active={editor.isActive('subscript')}
            icon={TextSubscriptIcon}
            title="Subscript"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            active={editor.isActive('superscript')}
            icon={TextSuperscriptIcon}
            title="Superscript"
          />
          <Divider />
          <AlignmentSelector editor={editor} />
          <Divider />
          <TextDirectionSelector editor={editor} />
        </div>

        {/* Fourth Row - Lists & Insert */}
        <div className="flex items-center gap-0.5 px-3 py-2 flex-wrap">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            icon={List}
            title="Bullet list"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            icon={LeftToRightListNumberIcon}
            title="Numbered list"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive('taskList')}
            icon={CheckmarkSquare01Icon}
            title="Task list"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            icon={QuoteUpIcon}
            title="Quote"
          />
          <Divider />
          <TableMenu editor={editor} />
          <Divider />
          <ToolbarButton
            onClick={addLink}
            active={editor.isActive('link')}
            icon={Link01Icon}
            title="Add link"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Insert image"
                className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717] data-[state=open]:bg-[#D93A3A]/10 data-[state=open]:text-[#D93A3A]"
              >
                <HugeiconsIcon icon={Image01Icon} className="h-4 w-4" />
                <span className="hidden sm:inline">Image</span>
                <HugeiconsIcon icon={ArrowDown01Icon} className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-52 border-[#E5E5E5] bg-white p-1.5 shadow-lg"
            >
              <DropdownMenuItem
                onClick={addImageByUrl}
                className="gap-3 rounded-md px-3 py-2 text-[#171717] focus:bg-[#F3F4F6] focus:text-[#171717]"
              >
                <HugeiconsIcon icon={GlobeIcon} className="h-4 w-4 text-[#737373]" />
                <span>Insert from URL</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={addImageByFile}
                className="gap-3 rounded-md px-3 py-2 text-[#171717] focus:bg-[#F3F4F6] focus:text-[#171717]"
              >
                <HugeiconsIcon icon={FolderOpenIcon} className="h-4 w-4 text-[#737373]" />
                <span>Insert from local files</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            icon={MinusSignIcon}
            title="Horizontal rule"
          />
          <Divider />
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            icon={UndoIcon}
            title="Undo (Ctrl+Z)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            icon={RedoIcon}
            title="Redo (Ctrl+Y)"
          />
        </div>
      </div>

      {/* Editor Content */}
      <div 
        className="flex-1 relative overflow-auto"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-[#D93A3A]/10 border-2 border-dashed border-[#D93A3A] m-4 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <HugeiconsIcon icon={Upload01Icon} className="w-16 h-16 text-[#D93A3A] mx-auto mb-3" />
              <p className="text-xl font-medium text-[#D93A3A]">Drop images here</p>
            </div>
          </div>
        )}

        <div className="prose prose-sm max-w-none p-6 min-h-[400px]">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar 
        editor={editor} 
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
      />
    </div>
  );
});
