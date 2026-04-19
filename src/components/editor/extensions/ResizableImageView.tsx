import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Copy01Icon, Delete02Icon, MoveIcon, RotateRight01Icon, TextAlignCenterIcon, TextAlignLeftIcon, TextAlignRightIcon } from "@hugeicons/core-free-icons";
import { useState, useRef, useCallback, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { ResizableImageTextWrap } from './ResizableImage';

const MIN_IMAGE_WIDTH = 120;
const DEFAULT_WRAP_WIDTH = 320;

function normalizeDimension(value: unknown, fallback: string) {
  if (typeof value === 'number') {
    return `${value}px`;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

function getWrapPresetWidth(currentWidth: string, container: HTMLDivElement | null) {
  if (!currentWidth.endsWith('%')) {
    return currentWidth;
  }

  const editorWidth = container?.closest('.ProseMirror')?.clientWidth ?? DEFAULT_WRAP_WIDTH * 2;
  const nextWidth = Math.max(MIN_IMAGE_WIDTH, Math.min(DEFAULT_WRAP_WIDTH, Math.round(editorWidth * 0.45)));
  return `${nextWidth}px`;
}

function normalizeOffset(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPointerAngle(clientX: number, clientY: number, centerX: number, centerY: number) {
  return (Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI;
}

function normalizeRotation(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function ResizableImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const {
    src,
    alt,
    title,
    width: initialWidth,
    height: initialHeight,
    rotation: initialRotation,
    textWrap: initialTextWrap,
    offsetX: initialOffsetX,
    offsetY: initialOffsetY,
  } = node.attrs;
  
  const [width, setWidth] = useState(normalizeDimension(initialWidth, '100%'));
  const [, setHeight] = useState(normalizeDimension(initialHeight, 'auto'));
  const [rotation, setRotation] = useState(initialRotation || 0);
  const [textWrap, setTextWrap] = useState<ResizableImageTextWrap>(initialTextWrap || 'break');
  const [offset, setOffset] = useState({
    x: normalizeOffset(initialOffsetX),
    y: normalizeOffset(initialOffsetY),
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const rotateStartRef = useRef({ centerX: 0, centerY: 0, angleOffset: 0 });
  const aspectRatioRef = useRef(1);
  const widthRef = useRef(normalizeDimension(initialWidth, '100%'));
  const heightRef = useRef(normalizeDimension(initialHeight, 'auto'));
  const rotationRef = useRef(initialRotation || 0);
  const textWrapRef = useRef<ResizableImageTextWrap>(initialTextWrap || 'break');
  const offsetRef = useRef({
    x: normalizeOffset(initialOffsetX),
    y: normalizeOffset(initialOffsetY),
  });

  useEffect(() => {
    const nextWidth = normalizeDimension(node.attrs.width, '100%');
    const nextHeight = normalizeDimension(node.attrs.height, 'auto');
    const nextRotation = Number(node.attrs.rotation || 0);
    const nextTextWrap = (node.attrs.textWrap || 'break') as ResizableImageTextWrap;
    const nextOffset = {
      x: normalizeOffset(node.attrs.offsetX),
      y: normalizeOffset(node.attrs.offsetY),
    };

    widthRef.current = nextWidth;
    heightRef.current = nextHeight;
    rotationRef.current = nextRotation;
    textWrapRef.current = nextTextWrap;
    offsetRef.current = nextOffset;

    setWidth(nextWidth);
    setHeight(nextHeight);
    setRotation(nextRotation);
    setTextWrap(nextTextWrap);
    setOffset(nextOffset);
  }, [node.attrs.height, node.attrs.offsetX, node.attrs.offsetY, node.attrs.rotation, node.attrs.textWrap, node.attrs.width]);

  const commitAttributes = useCallback((overrides: Partial<{
    width: string;
    height: string;
    rotation: number;
    textWrap: ResizableImageTextWrap;
    offsetX: number;
    offsetY: number;
  }> = {}) => {
    const nextWidth = normalizeDimension(overrides.width ?? widthRef.current, '100%');
    const nextHeight = normalizeDimension(overrides.height ?? heightRef.current, 'auto');
    const nextRotation = Number(overrides.rotation ?? rotationRef.current ?? 0);
    const nextTextWrap = (overrides.textWrap ?? textWrapRef.current ?? 'break') as ResizableImageTextWrap;
    const nextOffsetX = normalizeOffset(overrides.offsetX ?? offsetRef.current.x);
    const nextOffsetY = normalizeOffset(overrides.offsetY ?? offsetRef.current.y);

    const currentWidth = normalizeDimension(node.attrs.width, '100%');
    const currentHeight = normalizeDimension(node.attrs.height, 'auto');
    const currentRotation = Number(node.attrs.rotation || 0);
    const currentTextWrap = (node.attrs.textWrap || 'break') as ResizableImageTextWrap;
    const currentOffsetX = normalizeOffset(node.attrs.offsetX);
    const currentOffsetY = normalizeOffset(node.attrs.offsetY);

    if (
      currentWidth === nextWidth &&
      currentHeight === nextHeight &&
      currentRotation === nextRotation &&
      currentTextWrap === nextTextWrap &&
      currentOffsetX === nextOffsetX &&
      currentOffsetY === nextOffsetY
    ) {
      return;
    }

    updateAttributes({
      width: nextWidth,
      height: nextHeight,
      rotation: nextRotation,
      textWrap: nextTextWrap,
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
    });
  }, [node.attrs.height, node.attrs.offsetX, node.attrs.offsetY, node.attrs.rotation, node.attrs.textWrap, node.attrs.width, updateAttributes]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: containerRef.current?.offsetWidth || 0,
      height: containerRef.current?.offsetHeight || 0,
    };

    const handleResizeMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - resizeStartRef.current.x;
      const deltaY = moveEvent.clientY - resizeStartRef.current.y;

      const aspectRatio = aspectRatioRef.current || 1;
      const horizontalDelta = corner.includes('right')
        ? deltaX
        : corner.includes('left')
          ? -deltaX
          : 0;
      const verticalDelta = corner.includes('bottom')
        ? deltaY
        : corner.includes('top')
          ? -deltaY
          : 0;

      let newWidth = resizeStartRef.current.width;

      if (horizontalDelta !== 0) {
        newWidth += horizontalDelta;
      }

      if (horizontalDelta === 0 && verticalDelta !== 0) {
        newWidth += verticalDelta * aspectRatio;
      }

      if (horizontalDelta !== 0 && verticalDelta !== 0) {
        const widthFromVertical = resizeStartRef.current.width + (verticalDelta * aspectRatio);
        if (Math.abs(widthFromVertical - resizeStartRef.current.width) > Math.abs(newWidth - resizeStartRef.current.width)) {
          newWidth = widthFromVertical;
        }
      }

      const editorWidth = containerRef.current?.closest('.ProseMirror')?.clientWidth ?? resizeStartRef.current.width;
      const maxWidth = Math.max(MIN_IMAGE_WIDTH, editorWidth);
      const boundedWidth = Math.min(maxWidth, Math.max(MIN_IMAGE_WIDTH, newWidth));
      const nextWidth = `${Math.round(boundedWidth)}px`;

      widthRef.current = nextWidth;
      heightRef.current = 'auto';
      setWidth(nextWidth);
      setHeight('auto');
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      commitAttributes({
        width: widthRef.current,
        height: heightRef.current,
      });
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [commitAttributes]);

  const handleRotateStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    rotateStartRef.current = {
      centerX: bounds.left + (bounds.width / 2),
      centerY: bounds.top + (bounds.height / 2),
      angleOffset: getPointerAngle(e.clientX, e.clientY, bounds.left + (bounds.width / 2), bounds.top + (bounds.height / 2)) - rotationRef.current,
    };

    setIsRotating(true);

    const handleRotateMove = (moveEvent: MouseEvent) => {
      const currentAngle = getPointerAngle(
        moveEvent.clientX,
        moveEvent.clientY,
        rotateStartRef.current.centerX,
        rotateStartRef.current.centerY,
      );
      const nextRotation = normalizeRotation(currentAngle - rotateStartRef.current.angleOffset);
      rotationRef.current = nextRotation;
      setRotation(nextRotation);
    };

    const handleRotateEnd = () => {
      setIsRotating(false);
      commitAttributes({ rotation: rotationRef.current });
      document.removeEventListener('mousemove', handleRotateMove);
      document.removeEventListener('mouseup', handleRotateEnd);
    };

    document.addEventListener('mousemove', handleRotateMove);
    document.addEventListener('mouseup', handleRotateEnd);
  }, [commitAttributes]);

  const handleWrapChange = useCallback((nextWrap: ResizableImageTextWrap) => {
    textWrapRef.current = nextWrap;
    setTextWrap(nextWrap);
    heightRef.current = 'auto';
    setHeight('auto');
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });

    let nextWidth = widthRef.current;
    if (nextWrap !== 'break') {
      nextWidth = getWrapPresetWidth(normalizeDimension(widthRef.current, '100%'), containerRef.current);
      widthRef.current = nextWidth;
      setWidth(nextWidth);
    }

    commitAttributes({
      width: nextWidth,
      height: heightRef.current,
      textWrap: nextWrap,
      offsetX: 0,
      offsetY: 0,
    });
  }, [commitAttributes]);

  // Handle copy
  const handleCopy = useCallback(() => {
    if (imageRef.current) {
      // Create a canvas to copy the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = imageRef.current.naturalWidth;
        canvas.height = imageRef.current.naturalHeight;
        ctx.drawImage(imageRef.current, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const item = new ClipboardItem({ 'image/png': blob });
            navigator.clipboard.write([item]);
          }
        });
      }
    }
    // Also copy the node HTML
    const range = document.createRange();
    range.selectNode(containerRef.current as Node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('copy');
    selection?.removeAllRanges();
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - offsetRef.current.x,
      y: e.clientY - offsetRef.current.y,
    };

    const handleDragMove = (moveEvent: MouseEvent) => {
      const nextOffset = {
        x: moveEvent.clientX - dragStartRef.current.x,
        y: moveEvent.clientY - dragStartRef.current.y,
      };
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      commitAttributes({
        offsetX: offsetRef.current.x,
        offsetY: offsetRef.current.y,
      });
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }, [commitAttributes]);

  // Reset position
  const handleResetPosition = useCallback(() => {
    const nextOffset = { x: 0, y: 0 };
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
    commitAttributes({ offsetX: 0, offsetY: 0 });
  }, [commitAttributes]);

  const handleImageLoad = useCallback(() => {
    if (!imageRef.current) {
      return;
    }

    const { naturalWidth, naturalHeight } = imageRef.current;
    if (naturalWidth > 0 && naturalHeight > 0) {
      aspectRatioRef.current = naturalWidth / naturalHeight;
    }
  }, []);

  return (
    <NodeViewWrapper
      as="div"
      className={`resizable-image-wrapper ${selected ? 'selected' : ''}`}
      data-text-wrap={textWrap}
      style={{
        width,
        transform: (offset.x !== 0 || offset.y !== 0) ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
        cursor: isDragging ? 'grabbing' : undefined,
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => !isResizing && !isDragging && !isRotating && setShowControls(false)}
    >
      <div
        ref={containerRef}
        className="resizable-image-container"
        style={{ width: '100%' }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt || ''}
          title={title || ''}
          className="resizable-image"
          draggable={false}
          onLoad={handleImageLoad}
          style={{
            transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: 'center center',
          }}
        />

        {/* Resize handles - only show when selected */}
        {selected && (
          <>
            {/* Corner handles */}
            <div
              className="resize-handle resize-handle-nw"
              onMouseDown={(e) => handleResizeStart(e, 'top-left')}
            />
            <div
              className="resize-handle resize-handle-ne"
              onMouseDown={(e) => handleResizeStart(e, 'top-right')}
            />
            <div
              className="resize-handle resize-handle-sw"
              onMouseDown={(e) => handleResizeStart(e, 'bottom-left')}
            />
            <div
              className="resize-handle resize-handle-se"
              onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
            />

            {/* Edge handles */}
            <div
              className="resize-handle resize-handle-n"
              onMouseDown={(e) => handleResizeStart(e, 'top')}
            />
            <div
              className="resize-handle resize-handle-s"
              onMouseDown={(e) => handleResizeStart(e, 'bottom')}
            />
            <div
              className="resize-handle resize-handle-w"
              onMouseDown={(e) => handleResizeStart(e, 'left')}
            />
            <div
              className="resize-handle resize-handle-e"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
            />
          </>
        )}

        {/* Control toolbar */}
        {(showControls || selected) && (
          <div className="image-controls">
            <button
              className={`image-control-btn ${textWrap === 'left' ? 'image-control-btn-active' : ''}`}
              onClick={() => handleWrapChange('left')}
              title="Wrap text on the right"
            >
              <HugeiconsIcon icon={TextAlignLeftIcon} className="w-4 h-4" />
            </button>
            <button
              className={`image-control-btn ${textWrap === 'break' ? 'image-control-btn-active' : ''}`}
              onClick={() => handleWrapChange('break')}
              title="Keep image on its own row"
            >
              <HugeiconsIcon icon={TextAlignCenterIcon} className="w-4 h-4" />
            </button>
            <button
              className={`image-control-btn ${textWrap === 'right' ? 'image-control-btn-active' : ''}`}
              onClick={() => handleWrapChange('right')}
              title="Wrap text on the left"
            >
              <HugeiconsIcon icon={TextAlignRightIcon} className="w-4 h-4" />
            </button>
            <button
              className={`image-control-btn ${isRotating ? 'image-control-btn-active' : ''}`}
              onMouseDown={handleRotateStart}
              title="Rotate image"
            >
              <HugeiconsIcon icon={RotateRight01Icon} className="w-4 h-4" />
            </button>
            <button
              className="image-control-btn"
              onMouseDown={handleDragStart}
              title="Move image"
            >
              <HugeiconsIcon icon={MoveIcon} className="w-4 h-4" />
            </button>
            {(offset.x !== 0 || offset.y !== 0) && (
              <button
                className="image-control-btn"
                onClick={handleResetPosition}
                title="Reset position"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
              </button>
            )}
            <button
              className="image-control-btn"
              onClick={handleCopy}
              title="Copy image"
            >
              <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
            </button>
            <button
              className="image-control-btn image-control-btn-danger"
              onClick={() => deleteNode()}
              title="Delete image"
            >
              <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
