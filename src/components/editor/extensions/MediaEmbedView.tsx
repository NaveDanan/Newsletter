import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Delete02Icon, MoveIcon, MusicNote01Icon, Pdf01Icon, Presentation01Icon, TextAlignCenterIcon, TextAlignLeftIcon, TextAlignRightIcon, Video01Icon } from '@hugeicons/core-free-icons';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { IconSvgElement } from '@hugeicons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { createPptxViewer, type PptxViewerInstance } from '@/lib/pptx-viewer';
import { buildEmbedSrc, getDefaultMediaHeight, isIframeEmbed, isInteractiveMediaType, normalizeMediaDimension, normalizePreviewUrls, type MediaEmbedTextWrap, type MediaEmbedType } from './MediaEmbed';

const MEDIA_LABELS: Record<MediaEmbedType, string> = {
  video: 'Video',
  audio: 'Audio',
  pdf: 'PDF',
  pptx: 'PowerPoint',
};

const MEDIA_ICONS: Record<MediaEmbedType, IconSvgElement> = {
  video: Video01Icon,
  audio: MusicNote01Icon,
  pdf: Pdf01Icon,
  pptx: Presentation01Icon,
};

const IFRAME_HEIGHT: Record<MediaEmbedType, string> = {
  video: 'aspect-video',
  audio: 'h-20',
  pdf: 'h-[500px]',
  pptx: 'h-[500px]',
};

const MIN_MEDIA_WIDTH = 240;
const DEFAULT_WRAP_WIDTH = 360;

function normalizeOffset(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getWrapPresetWidth(currentWidth: string, container: HTMLDivElement | null) {
  if (!currentWidth.endsWith('%')) {
    return currentWidth;
  }

  const editorWidth = container?.closest('.ProseMirror')?.clientWidth ?? DEFAULT_WRAP_WIDTH * 2;
  const nextWidth = Math.max(MIN_MEDIA_WIDTH, Math.min(DEFAULT_WRAP_WIDTH, Math.round(editorWidth * 0.5)));
  return `${nextWidth}px`;
}

export function MediaEmbedView({ node, selected, deleteNode, updateAttributes }: NodeViewProps) {
  const { t } = useLocale();
  const src = node.attrs.src as string;
  const mediaType = node.attrs.mediaType as MediaEmbedType;
  const title = node.attrs.title as string | null;
  const widthAttr = normalizeMediaDimension(node.attrs.width, '100%') ?? '100%';
  const heightAttr = normalizeMediaDimension(node.attrs.height, getDefaultMediaHeight(mediaType));
  const textWrapAttr = (node.attrs.textWrap || 'break') as MediaEmbedTextWrap;
  const previewUrls = normalizePreviewUrls(node.attrs.previewUrls);
  const previewStatus = node.attrs.previewStatus as 'ready' | 'failed' | null;
  const previewError = typeof node.attrs.previewError === 'string' ? node.attrs.previewError : null;
  const pptxHostRef = useRef<HTMLDivElement | null>(null);
  const pptxViewerRef = useRef<PptxViewerInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewShellRef = useRef<HTMLDivElement | null>(null);
  const mediaFrameRef = useRef<HTMLDivElement | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [pptxError, setPptxError] = useState<string | null>(null);
  const [width, setWidth] = useState(widthAttr);
  const [height, setHeight] = useState(heightAttr);
  const [textWrap, setTextWrap] = useState<MediaEmbedTextWrap>(textWrapAttr);
  const [offset, setOffset] = useState({
    x: normalizeOffset(node.attrs.offsetX),
    y: normalizeOffset(node.attrs.offsetY),
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPptxPreviewFullscreen, setIsPptxPreviewFullscreen] = useState(false);
  const widthRef = useRef(widthAttr);
  const heightRef = useRef(heightAttr);
  const textWrapRef = useRef<MediaEmbedTextWrap>(textWrapAttr);
  const offsetRef = useRef({
    x: normalizeOffset(node.attrs.offsetX),
    y: normalizeOffset(node.attrs.offsetY),
  });

  const embedSrc = buildEmbedSrc(mediaType, src);
  const useIframe = isIframeEmbed(mediaType, src);
  const Icon = MEDIA_ICONS[mediaType];
  const label = MEDIA_LABELS[mediaType];
  const interactiveMedia = isInteractiveMediaType(mediaType);
  const activeSlide = Math.min(currentSlide, Math.max(0, previewUrls.length - 1));

  useEffect(() => {
    const nextWidth = normalizeMediaDimension(node.attrs.width, '100%') ?? '100%';
    const nextHeight = normalizeMediaDimension(node.attrs.height, getDefaultMediaHeight(mediaType));
    const nextTextWrap = (node.attrs.textWrap || 'break') as MediaEmbedTextWrap;
    const nextOffset = {
      x: normalizeOffset(node.attrs.offsetX),
      y: normalizeOffset(node.attrs.offsetY),
    };

    widthRef.current = nextWidth;
    heightRef.current = nextHeight;
    textWrapRef.current = nextTextWrap;
    offsetRef.current = nextOffset;

    setWidth(nextWidth);
    setHeight(nextHeight);
    setTextWrap(nextTextWrap);
    setOffset(nextOffset);
  }, [mediaType, node.attrs.height, node.attrs.offsetX, node.attrs.offsetY, node.attrs.textWrap, node.attrs.width]);

  const commitAttributes = useCallback((overrides: Partial<{
    width: string;
    height: string | null;
    textWrap: MediaEmbedTextWrap;
    offsetX: number;
    offsetY: number;
  }> = {}) => {
    const nextWidth = normalizeMediaDimension(overrides.width ?? widthRef.current, '100%') ?? '100%';
    const nextHeight = normalizeMediaDimension(overrides.height ?? heightRef.current, getDefaultMediaHeight(mediaType));
    const nextTextWrap = (overrides.textWrap ?? textWrapRef.current ?? 'break') as MediaEmbedTextWrap;
    const nextOffsetX = normalizeOffset(overrides.offsetX ?? offsetRef.current.x);
    const nextOffsetY = normalizeOffset(overrides.offsetY ?? offsetRef.current.y);

    const currentWidth = normalizeMediaDimension(node.attrs.width, '100%') ?? '100%';
    const currentHeight = normalizeMediaDimension(node.attrs.height, getDefaultMediaHeight(mediaType));
    const currentTextWrap = (node.attrs.textWrap || 'break') as MediaEmbedTextWrap;
    const currentOffsetX = normalizeOffset(node.attrs.offsetX);
    const currentOffsetY = normalizeOffset(node.attrs.offsetY);

    if (
      currentWidth === nextWidth &&
      currentHeight === nextHeight &&
      currentTextWrap === nextTextWrap &&
      currentOffsetX === nextOffsetX &&
      currentOffsetY === nextOffsetY
    ) {
      return;
    }

    updateAttributes({
      width: nextWidth,
      height: nextHeight,
      textWrap: nextTextWrap,
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
    });
  }, [mediaType, node.attrs.height, node.attrs.offsetX, node.attrs.offsetY, node.attrs.textWrap, node.attrs.width, updateAttributes]);

  useEffect(() => {
    if (mediaType !== 'pptx' || !pptxHostRef.current) {
      return;
    }
    if (previewUrls.length > 0) {
      return;
    }

    let cancelled = false;
    setPptxError(null);

    void createPptxViewer(pptxHostRef.current, src).then((viewer) => {
      if (cancelled) {
        viewer.destroy();
        return;
      }

      pptxViewerRef.current = viewer;
    }).catch((error) => {
      console.error('Failed to render PowerPoint inside editor:', error);
      setPptxError(t('editor.failedPresentation'));
    });

    return () => {
      cancelled = true;
      pptxViewerRef.current?.destroy();
      pptxViewerRef.current = null;
    };
  }, [mediaType, previewUrls.length, src, t]);

  useEffect(() => {
    if (mediaType !== 'pptx' || previewUrls.length === 0) {
      return;
    }

    const handleFullscreenChange = () => {
      setIsPptxPreviewFullscreen(document.fullscreenElement === previewShellRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [mediaType, previewUrls.length]);

  const handleWrapChange = useCallback((nextWrap: MediaEmbedTextWrap) => {
    textWrapRef.current = nextWrap;
    setTextWrap(nextWrap);

    const nextOffset = { x: 0, y: 0 };
    offsetRef.current = nextOffset;
    setOffset(nextOffset);

    let nextWidth = widthRef.current;
    if (nextWrap !== 'break') {
      nextWidth = getWrapPresetWidth(widthRef.current, containerRef.current);
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

  const handleResizeStart = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();

    const frameRect = mediaFrameRef.current?.getBoundingClientRect();
    const startWidth = frameRect?.width || containerRef.current?.offsetWidth || 0;
    const startHeight = frameRect?.height || mediaFrameRef.current?.offsetHeight || 0;
    const aspectRatio = startHeight > 0 ? startWidth / startHeight : (mediaType === 'video' ? (16 / 9) : 1.6);

    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: startWidth,
      height: startHeight,
    };
    setIsResizing(true);

    const handleResizeMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - resizeStartRef.current.x;
      const deltaY = moveEvent.clientY - resizeStartRef.current.y;

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
      const maxWidth = Math.max(MIN_MEDIA_WIDTH, editorWidth);
      const boundedWidth = Math.min(maxWidth, Math.max(MIN_MEDIA_WIDTH, newWidth));
      const nextWidth = `${Math.round(boundedWidth)}px`;
      const nextHeight = `${Math.round(Math.max(mediaType === 'video' ? 180 : 260, boundedWidth / aspectRatio))}px`;

      widthRef.current = nextWidth;
      heightRef.current = nextHeight;
      setWidth(nextWidth);
      setHeight(nextHeight);
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
  }, [commitAttributes, mediaType]);

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

  const handleResetPosition = useCallback(() => {
    const nextOffset = { x: 0, y: 0 };
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
    commitAttributes({ offsetX: 0, offsetY: 0 });
  }, [commitAttributes]);

  const handlePptxPreviewFullscreen = useCallback(() => {
    const target = previewShellRef.current;
    if (!target) {
      return;
    }

    if (document.fullscreenElement === target) {
      void document.exitFullscreen();
      return;
    }

    void target.requestFullscreen();
  }, []);

  if (!src) {
    return null;
  }

  if (interactiveMedia) {
    const isPptxPreviewMode = mediaType === 'pptx' && previewUrls.length > 0;
    const previewCardFullscreen = isPptxPreviewMode && isPptxPreviewFullscreen;
    const frameStyle: React.CSSProperties = height
      ? { height }
      : mediaType === 'video'
        ? { aspectRatio: '16 / 9' }
        : { height: getDefaultMediaHeight(mediaType) ?? undefined };
    const previewFrameStyle: React.CSSProperties = previewCardFullscreen
      ? {
          ...frameStyle,
          flex: '1 1 auto',
          height: 'auto',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px 28px 20px',
          boxSizing: 'border-box',
          background: '#0F1115',
        }
      : frameStyle;
    const previewControlsClass = previewCardFullscreen
      ? 'flex flex-wrap items-center justify-between gap-3 bg-[#0F1115] px-4 py-4'
      : 'flex items-center justify-between gap-2 border-t border-[#F0F0F0] px-2 py-1';
    const previewNavButtonClass = previewCardFullscreen
      ? 'rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs font-medium text-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-45'
      : 'rounded-md border border-[#E5E5E5] bg-transparent px-2 py-1 text-xs font-medium text-[#525252] disabled:cursor-not-allowed disabled:opacity-45';
    const previewCounterClass = previewCardFullscreen
      ? 'text-xs font-medium text-[#F5F5F5]'
      : 'text-xs font-medium text-[#525252]';
    const previewLinkClass = previewCardFullscreen
      ? 'text-xs font-medium text-[#F87171] hover:text-[#FCA5A5]'
      : 'text-xs font-medium text-[#525252] hover:text-[#D93A3A]';
    const previewFullscreenButtonClass = previewCardFullscreen
      ? 'rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-[#F5F5F5] transition-colors hover:border-[#F87171] hover:text-[#FCA5A5]'
      : 'rounded-md border border-[#E5E5E5] bg-transparent px-2.5 py-1 text-xs font-medium text-[#525252] transition-colors hover:border-[#D93A3A] hover:text-[#D93A3A]';

    return (
      <NodeViewWrapper
        as="div"
        className={`media-embed-wrapper ${selected ? 'selected' : ''}`}
        data-text-wrap={textWrap}
        style={{
          width,
          transform: (offset.x !== 0 || offset.y !== 0) ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
          cursor: isDragging ? 'grabbing' : undefined,
        }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => !isResizing && !isDragging && setShowControls(false)}
      >
        <div ref={containerRef} className="media-embed-container">
          {selected && (
            <>
              <div className="resize-handle resize-handle-nw" onMouseDown={(e) => handleResizeStart(e, 'top-left')} />
              <div className="resize-handle resize-handle-ne" onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
              <div className="resize-handle resize-handle-sw" onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
              <div className="resize-handle resize-handle-se" onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
              <div className="resize-handle resize-handle-n" onMouseDown={(e) => handleResizeStart(e, 'top')} />
              <div className="resize-handle resize-handle-s" onMouseDown={(e) => handleResizeStart(e, 'bottom')} />
              <div className="resize-handle resize-handle-w" onMouseDown={(e) => handleResizeStart(e, 'left')} />
              <div className="resize-handle resize-handle-e" onMouseDown={(e) => handleResizeStart(e, 'right')} />
            </>
          )}

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
                title="Keep media on its own row"
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
                className="image-control-btn"
                onMouseDown={handleDragStart}
                title={`Move ${label.toLowerCase()}`}
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
                className="image-control-btn image-control-btn-danger"
                onClick={() => deleteNode()}
                title={`Remove ${label}`}
              >
                <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
              </button>
            </div>
          )}

          <div
            ref={previewShellRef}
            className={`overflow-hidden transition-colors ${previewCardFullscreen ? 'flex h-full flex-col rounded-none border-0 bg-[#0F1115]' : `rounded-xl border-2 bg-white ${selected ? 'border-[#D93A3A]' : 'border-[#E5E5E5]'}`}`}
          >
            <div className="flex min-w-0 items-center gap-2 border-b border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2">
              <HugeiconsIcon icon={Icon} className="h-4 w-4 shrink-0 text-[#737373]" />
              <span className="text-sm font-medium text-[#737373]">{label}</span>
              {title ? (
                <span className="truncate text-sm text-[#A3A3A3]">— {title}</span>
              ) : null}
            </div>

            <div ref={mediaFrameRef} className={previewCardFullscreen ? 'bg-[#0F1115]' : 'bg-white'} style={previewFrameStyle}>
              {mediaType === 'pptx' ? (
                previewUrls.length > 0 ? (
                  <div className={`flex h-full w-full items-center justify-center ${previewCardFullscreen ? 'bg-[#0F1115]' : 'bg-white'}`}>
                    <img
                      src={previewUrls[activeSlide]}
                      alt={title ?? `PowerPoint slide ${activeSlide + 1}`}
                      className="block h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="h-full w-full overflow-hidden bg-white">
                    {pptxError ? (
                      <p className="px-3 py-2 text-sm text-[#B91C1C]">{pptxError}</p>
                    ) : null}
                    <div ref={pptxHostRef} className="min-h-full w-full overflow-hidden" />
                  </div>
                )
              ) : mediaType === 'video' && !useIframe ? (
                <video src={src} controls className="h-full w-full" style={{ display: 'block', objectFit: 'contain' }} />
              ) : (
                <iframe
                  src={embedSrc}
                  className="h-full w-full border-none"
                  allowFullScreen
                  loading="lazy"
                  title={title ?? label}
                />
              )}
            </div>
            {mediaType === 'pptx' ? (
              <div className={previewControlsClass}>
                {previewUrls.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentSlide(Math.max(0, activeSlide - 1))}
                      disabled={activeSlide <= 0}
                      className={previewNavButtonClass}
                    >
                      {t('editor.previous')}
                    </button>
                    <span className={previewCounterClass}>
                      {activeSlide + 1} / {previewUrls.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentSlide(Math.min(previewUrls.length - 1, activeSlide + 1))}
                      disabled={activeSlide >= previewUrls.length - 1}
                      className={previewNavButtonClass}
                    >
                      {t('editor.next')}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-[#B91C1C]">
                    {previewStatus === 'failed' ? (previewError ?? t('editor.failedPresentation')) : t('editor.loadingPresentation')}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <a
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className={previewLinkClass}
                  >
                    {t('editor.downloadPresentation')}
                  </a>
                  <button
                    type="button"
                    onClick={previewUrls.length > 0 ? handlePptxPreviewFullscreen : () => void pptxViewerRef.current?.toggleFullscreen()}
                    className={previewFullscreenButtonClass}
                  >
                    {previewCardFullscreen ? t('editor.exitFullscreenLabel') : t('editor.fullscreenLabel')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div
        className={`my-4 overflow-hidden rounded-xl border-2 transition-colors ${
          selected ? 'border-[#D93A3A]' : 'border-[#E5E5E5]'
        }`}
      >
        {/* Widget header */}
        <div className="flex items-center justify-between border-b border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon icon={Icon} className="h-4 w-4 shrink-0 text-[#737373]" />
            <span className="text-sm font-medium text-[#737373]">{label}</span>
            {title && (
              <span className="truncate text-sm text-[#A3A3A3]">— {title}</span>
            )}
          </div>
          <button
            type="button"
            onClick={deleteNode}
            title={`Remove ${label}`}
            className="ml-2 shrink-0 rounded p-1 text-[#737373] transition-colors hover:bg-red-100 hover:text-[#D93A3A]"
          >
            <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" />
          </button>
        </div>

        {/* Media content */}
        <div className="bg-white">
          {mediaType === 'audio' ? (
            <div className="p-4">
              <audio src={src} controls className="w-full" />
            </div>
          ) : (
            <iframe
              src={embedSrc}
              className={`w-full border-none ${IFRAME_HEIGHT[mediaType]}`}
              allowFullScreen
              loading="lazy"
              title={title ?? label}
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
