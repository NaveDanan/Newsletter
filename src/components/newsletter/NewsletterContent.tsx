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
        const host = wrapper.querySelector<HTMLElement>('[data-pptx-viewer-host="true"]');
        const status = wrapper.querySelector<HTMLElement>('[data-pptx-status="true"]');
        const button = wrapper.querySelector<HTMLButtonElement>('[data-pptx-fullscreen="true"]');
        const downloadLink = wrapper.querySelector<HTMLAnchorElement>('[data-pptx-download="true"]');

        if (!src || !host || !status || !button) {
          continue;
        }

        status.hidden = false;
        status.textContent = t('editor.loadingPresentation');
        button.disabled = true;
        button.textContent = t('editor.fullscreenLabel');
        if (downloadLink) {
          downloadLink.textContent = t('editor.downloadPresentation');
        }

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
          status.hidden = true;
          button.disabled = false;

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