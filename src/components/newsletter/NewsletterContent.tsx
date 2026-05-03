import { useEffect, useRef } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { createPptxViewer, type PptxViewerInstance } from '@/lib/pptx-viewer';

interface NewsletterContentProps {
  html: string;
  className?: string;
  dir?: 'auto' | 'ltr' | 'rtl';
}

interface PptxBinding {
  button: HTMLButtonElement;
  handleToggle: () => void;
  viewer: PptxViewerInstance;
}

function compactPptxHost(host: HTMLElement) {
  // Older saved embeds include a fixed 500px host height. Once the controls
  // live inside that host, the fixed height leaves a large empty footer.
  host.style.height = 'auto';
  host.style.minHeight = '0';
  host.style.maxHeight = 'none';
  host.style.paddingBottom = '0';
}

function normalizePreviewUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizePreviewUrls(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

export function NewsletterContent({ html, className, dir = 'auto' }: NewsletterContentProps) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Set innerHTML imperatively so React does not overwrite it on re-renders.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = html;
    }
  }, [html]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }

    const bindings: PptxBinding[] = [];
    let cancelled = false;

    const mountPresentations = async () => {
      const wrappers = Array.from(
        root.querySelectorAll<HTMLElement>('[data-media-embed="true"][data-media-type="pptx"]'),
      );

      for (const wrapper of wrappers) {
        const src = wrapper.dataset.mediaSrc?.trim();
        const previewUrls = normalizePreviewUrls(wrapper.dataset.mediaPreviewUrls);
        const host = wrapper.querySelector<HTMLElement>('[data-pptx-viewer-host="true"]');
        const status = wrapper.querySelector<HTMLElement>('[data-pptx-status="true"]');
        const button = wrapper.querySelector<HTMLButtonElement>('[data-pptx-fullscreen="true"]');
        const downloadLink = wrapper.querySelector<HTMLAnchorElement>('[data-pptx-download="true"]');

        if (src && previewUrls.length > 0) {
          const viewer = wrapper.querySelector<HTMLElement>('[data-pptx-preview-viewer="true"]');
          const frame = wrapper.querySelector<HTMLElement>('[data-pptx-preview-frame="true"]');
          const image = wrapper.querySelector<HTMLImageElement>('[data-pptx-preview-image="true"]');
          const controls = wrapper.querySelector<HTMLElement>('[data-pptx-preview-controls="true"]');
          const previous = wrapper.querySelector<HTMLButtonElement>('[data-pptx-preview-prev="true"]');
          const next = wrapper.querySelector<HTMLButtonElement>('[data-pptx-preview-next="true"]');
          const counter = wrapper.querySelector<HTMLElement>('[data-pptx-preview-counter="true"]');
          const fullscreen = wrapper.querySelector<HTMLButtonElement>('[data-pptx-preview-fullscreen="true"]');
          const previewDownload = wrapper.querySelector<HTMLAnchorElement>('[data-pptx-download="true"]');

          if (!viewer || !frame || !image || !controls || !previous || !next || !counter || !fullscreen) {
            continue;
          }

          const viewerStyle = viewer.getAttribute('style') ?? '';
          const frameStyle = frame.getAttribute('style') ?? '';
          const controlsStyle = controls.getAttribute('style') ?? '';
          const imageStyle = image.getAttribute('style') ?? '';
          const previousStyle = previous.getAttribute('style') ?? '';
          const nextStyle = next.getAttribute('style') ?? '';
          const counterStyle = counter.getAttribute('style') ?? '';
          const fullscreenStyle = fullscreen.getAttribute('style') ?? '';
          const previewDownloadStyle = previewDownload?.getAttribute('style') ?? '';

          let currentSlide = 0;
          const updateSlide = () => {
            image.src = previewUrls[currentSlide];
            image.alt = `${wrapper.dataset.mediaTitle || 'PowerPoint'} ${currentSlide + 1}`;
            counter.textContent = `${currentSlide + 1} / ${previewUrls.length}`;
            previous.disabled = currentSlide <= 0;
            next.disabled = currentSlide >= previewUrls.length - 1;
          };
          const applyFullscreenState = () => {
            const isFullscreen = document.fullscreenElement === viewer;

            viewer.style.cssText = isFullscreen
              ? `${viewerStyle};display:flex;flex-direction:column;width:100vw;height:100vh;max-width:none;border-radius:0;box-sizing:border-box;background:#0F1115;`
              : viewerStyle;
            frame.style.cssText = isFullscreen
              ? `${frameStyle};display:flex;flex:1 1 auto;min-height:0;height:auto;align-items:center;justify-content:center;padding:28px 28px 20px;box-sizing:border-box;background:#0F1115;`
              : frameStyle;
            controls.style.cssText = isFullscreen
              ? `${controlsStyle};flex:0 0 auto;flex-wrap:wrap;gap:12px;padding:10px 14px 18px;background:#0F1115;border-top:0;`
              : controlsStyle;
            image.style.cssText = isFullscreen
              ? `${imageStyle};max-height:100%;`
              : imageStyle;
            previous.style.cssText = isFullscreen
              ? `${previousStyle};border-color:rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#F5F5F5;`
              : previousStyle;
            next.style.cssText = isFullscreen
              ? `${nextStyle};border-color:rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#F5F5F5;`
              : nextStyle;
            counter.style.cssText = isFullscreen
              ? `${counterStyle};color:#F5F5F5;`
              : counterStyle;
            fullscreen.style.cssText = isFullscreen
              ? `${fullscreenStyle};border-color:rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#F5F5F5;`
              : fullscreenStyle;
            if (previewDownload) {
              previewDownload.style.cssText = isFullscreen
                ? `${previewDownloadStyle};color:#F87171;text-decoration:none;`
                : previewDownloadStyle;
            }
            fullscreen.textContent = isFullscreen
              ? t('editor.exitFullscreenLabel')
              : t('editor.fullscreenLabel');
          };
          const handlePrevious = () => {
            currentSlide = Math.max(0, currentSlide - 1);
            updateSlide();
          };
          const handleNext = () => {
            currentSlide = Math.min(previewUrls.length - 1, currentSlide + 1);
            updateSlide();
          };
          const handleFullscreen = () => {
            if (document.fullscreenElement === viewer) {
              void document.exitFullscreen();
              return;
            }
            void viewer.requestFullscreen();
          };
          const handleFullscreenChange = () => {
            applyFullscreenState();
          };

          previous.textContent = t('editor.previous');
          next.textContent = t('editor.next');
          if (previewDownload) {
            previewDownload.textContent = t('editor.downloadPresentation');
          }
          previous.addEventListener('click', handlePrevious);
          next.addEventListener('click', handleNext);
          fullscreen.addEventListener('click', handleFullscreen);
          document.addEventListener('fullscreenchange', handleFullscreenChange);
          applyFullscreenState();
          updateSlide();

          bindings.push({
            button: fullscreen,
            handleToggle: handleFullscreen,
            viewer: {
              load: async () => undefined,
              toggleFullscreen: async () => handleFullscreen(),
              destroy: () => {
                previous.removeEventListener('click', handlePrevious);
                next.removeEventListener('click', handleNext);
                fullscreen.removeEventListener('click', handleFullscreen);
                document.removeEventListener('fullscreenchange', handleFullscreenChange);
              },
            },
          });
          continue;
        }

        if (!src || !host || !status || !button) {
          continue;
        }

        status.hidden = false;
        status.textContent = t('editor.loadingPresentation');
        button.disabled = true;
        button.textContent = t('editor.fullscreenLabel');
        button.dataset.pptxFullscreenLabel = t('editor.fullscreenLabel');
        button.dataset.pptxExitFullscreenLabel = t('editor.exitFullscreenLabel');
        if (downloadLink) {
          downloadLink.textContent = t('editor.downloadPresentation');
        }
        compactPptxHost(host);

        // Build a progress bar inside the status element
        const progressWrap = document.createElement('div');
        progressWrap.style.cssText = 'width:100%;max-width:320px;margin:8px auto 0;height:6px;border-radius:6px;background:#E5E5E5;overflow:hidden';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width:0%;height:100%;border-radius:6px;background:#D93A3A;transition:width .2s';
        progressWrap.appendChild(progressBar);
        status.appendChild(progressWrap);

        try {
          const viewer = await createPptxViewer(host, src, {
            onProgress(phase, pct) {
              if (phase === 'download') {
                status.childNodes[0].textContent = t('editor.downloadingPresentation') || 'Downloading presentation...';
                progressBar.style.width = `${pct}%`;
              } else {
                status.childNodes[0].textContent = t('editor.convertingPresentation') || 'Converting slides...';
                progressBar.style.width = '100%';
              }
            },
          });
          if (cancelled) {
            viewer.destroy();
            return;
          }

          host.hidden = false;
          compactPptxHost(host);
          status.remove();
          button.disabled = false;

          // Move download + fullscreen into the viewer controls bar
          const actionsSlot = host.querySelector('[data-pptx-actions]');
          const actionsSource = wrapper.querySelector('[data-pptx-actions-source]');
          if (actionsSlot) {
            if (downloadLink) actionsSlot.appendChild(downloadLink);
            actionsSlot.appendChild(button);
          }
          if (actionsSource) actionsSource.remove();

          const handleToggle = () => {
            void viewer.toggleFullscreen();
          };

          button.addEventListener('click', handleToggle);
          bindings.push({ button, handleToggle, viewer });
        } catch (error) {
          console.error('Failed to mount PowerPoint viewer:', error);
          status.hidden = false;
          status.textContent = t('editor.failedPresentation');
          button.disabled = true;
          // Show download link even on failure
          const actionsSource = wrapper.querySelector<HTMLElement>('[data-pptx-actions-source]');
          if (actionsSource) {
            actionsSource.style.display = 'flex';
            actionsSource.style.alignItems = 'center';
            actionsSource.style.gap = '8px';
            actionsSource.style.padding = '8px 12px';
            actionsSource.style.borderTop = '1px solid #F0F0F0';
          }
        }
      }
    };

    void mountPresentations();

    return () => {
      cancelled = true;
      bindings.forEach(({ button, handleToggle, viewer }) => {
        button.removeEventListener('click', handleToggle);
        viewer.destroy();
      });
    };
  }, [html, t]);

  return (
    <div
      ref={containerRef}
      className={className}
      dir={dir}
    />
  );
}
