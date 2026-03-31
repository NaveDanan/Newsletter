import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { CodeIcon, Heading01Icon, Heading02Icon, Image01Icon, LeftToRightListNumberIcon, Link01Icon, List, MinusSignIcon, QuoteUpIcon, RedoIcon, TextBoldIcon, TextItalicIcon, TextStrikethroughIcon, TextUnderlineIcon, UndoIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { toast } from 'sonner';
import { ResizableImage } from './extensions/ResizableImage';
import { useCallback, useRef, useState } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder = 'Start writing your newsletter...' }: RichTextEditorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
        },
      }),
      ResizableImage.configure({
        allowBase64: true,
        inline: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) {
    return null;
  }

  // Process and upload image file
  const processImageFile = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 10MB for article images)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    // Convert to base64
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
    reader.onerror = () => {
      toast.error('Failed to read image file');
    };
    reader.readAsDataURL(file);
  }, [editor]);

  // Add image via URL
  const addImageByUrl = useCallback(() => {
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

  // Add image via file upload
  const addImageByFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processImageFile(files[0]);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processImageFile]);

  // Drag & drop handlers for the editor area
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      Array.from(files).forEach((file) => {
        if (file.type.startsWith('image/')) {
          processImageFile(file);
        }
      });
    }
  }, [processImageFile]);

  // Paste handler for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      Array.from(items).forEach((item) => {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
          }
        }
      });
    }
  }, [processImageFile]);

  const addLink = useCallback(() => {
    const url = window.prompt('Enter URL');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const ToolbarButton = ({ 
    onClick, 
    active = false, 
    icon: Icon,
    title,
  }: { 
    onClick: () => void; 
    active?: boolean; 
    icon: IconSvgElement;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors ${
        active 
          ? 'bg-[#D93A3A] text-white' 
          : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
      }`}
    >
      <HugeiconsIcon icon={Icon} className="w-4 h-4" />
    </button>
  );

  const Divider = () => <div className="w-px h-6 bg-[#E5E5E5] mx-1" />;

  return (
    <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-3 border-b border-[#E5E5E5] bg-[#F9FAFB]">
        {/* Text formatting */}
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
          title="Inline Code"
        />

        <Divider />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          icon={Heading01Icon}
          title="Heading 1"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          icon={Heading02Icon}
          title="Heading 2"
        />

        <Divider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          icon={List}
          title="Bullet List"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          icon={LeftToRightListNumberIcon}
          title="Numbered List"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          icon={QuoteUpIcon}
          title="Quote"
        />

        <Divider />

        {/* Insert */}
        <ToolbarButton
          onClick={addLink}
          active={editor.isActive('link')}
          icon={Link01Icon}
          title="Add Link"
        />
        <ToolbarButton
          onClick={addImageByFile}
          icon={Upload01Icon}
          title="Upload Image"
        />
        <ToolbarButton
          onClick={addImageByUrl}
          icon={Image01Icon}
          title="Insert Image from URL"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          icon={MinusSignIcon}
          title="Horizontal Rule"
        />

        <Divider />

        {/* History */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          icon={UndoIcon}
          title="Undo (Ctrl+Z)"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          icon={RedoIcon}
          title="Redo (Ctrl+Y)"
        />
      </div>

      {/* Editor content with drag & drop */}
      <div
        ref={editorRef}
        className="relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-[#D93A3A]/10 border-2 border-dashed border-[#D93A3A] rounded-lg m-2 flex items-center justify-center">
            <div className="text-center">
              <HugeiconsIcon icon={Upload01Icon} className="w-12 h-12 text-[#D93A3A] mx-auto mb-2" />
              <p className="text-lg font-medium text-[#D93A3A]">Drop images here</p>
            </div>
          </div>
        )}

        <div className="prose prose-sm max-w-none p-4 min-h-[400px]">
          <EditorContent editor={editor} />
        </div>

        {/* Drop hint */}
        {!isDragging && editor.isEmpty && (
          <div className="absolute bottom-4 left-4 text-xs text-[#A3A3A3] pointer-events-none">
            Tip: Drag & drop images here or paste from clipboard
          </div>
        )}
      </div>
    </div>
  );
}
