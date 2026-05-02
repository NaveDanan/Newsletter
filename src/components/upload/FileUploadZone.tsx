import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Image01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { UploadLoadingDialog } from './UploadLoadingDialog';

interface FileUploadZoneProps {
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  maxSize?: number; // in MB
  label?: string;
  showPreview?: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('File read returned an empty result.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export function FileUploadZone({
  value,
  onChange,
  accept = 'image/*',
  maxSize = 5,
  label = 'Upload Image',
  showPreview = true,
}: FileUploadZoneProps) {
  const { t } = useLocale();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`File size must be less than ${maxSize}MB`);
      return;
    }

    setIsUploading(true);
    setUploadingFileName(file.name);

    try {
      const result = await readFileAsDataUrl(file);
      if (result) {
        onChange(result);
        toast.success('Image uploaded successfully');
      }
    } catch {
      toast.error('Failed to read image file');
    } finally {
      setIsUploading(false);
      setUploadingFileName(null);
    }
  }, [maxSize, onChange]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
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
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (value && showPreview) {
    return (
      <div className="relative">
        <UploadLoadingDialog
          open={isUploading}
          title={t('editor.uploadingImage')}
          description={t('editor.uploadingFileDescription')}
          fileName={uploadingFileName ?? undefined}
        />
        <div className="relative h-48 lg:h-56 rounded-xl overflow-hidden group">
          <img
            src={value}
            alt="Preview"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              onClick={handleClick}
              className="p-3 bg-white rounded-full hover:bg-gray-100 transition-colors"
              title="Change image"
            >
              <HugeiconsIcon icon={Upload01Icon} className="w-5 h-5 text-[#171717]" />
            </button>
            <button
              onClick={handleClear}
              className="p-3 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
              title="Remove image"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <>
      <UploadLoadingDialog
        open={isUploading}
        title={t('editor.uploadingImage')}
        description={t('editor.uploadingFileDescription')}
        fileName={uploadingFileName ?? undefined}
      />
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 cursor-pointer
          transition-all duration-200
          ${isDragging 
            ? 'border-[#D93A3A] bg-[#D93A3A]/5' 
            : 'border-[#E5E5E5] bg-[#F9FAFB] hover:border-[#D93A3A]/50 hover:bg-[#F3F4F6]'
          }
          ${isUploading ? 'pointer-events-none opacity-70' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className={`
            w-14 h-14 rounded-full flex items-center justify-center
            transition-colors duration-200
            ${isDragging ? 'bg-[#D93A3A]/10' : 'bg-white'}
          `}>
            {isUploading ? (
              <div className="w-6 h-6 border-2 border-[#D93A3A] border-t-transparent rounded-full animate-spin" />
            ) : (
              <HugeiconsIcon icon={Image01Icon} className={`
                w-6 h-6 transition-colors duration-200
                ${isDragging ? 'text-[#D93A3A]' : 'text-[#737373]'}
              `} />
            )}
          </div>
          
          <div className="text-center">
            <p className="font-medium text-[#171717] mb-1">
              {isUploading ? 'Uploading...' : isDragging ? 'Drop image here' : label}
            </p>
            <p className="text-sm text-[#737373]">
              Drag & drop or click to browse
            </p>
            <p className="text-xs text-[#A3A3A3] mt-2">
              Supports: JPG, PNG, GIF, WebP (max {maxSize}MB)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
