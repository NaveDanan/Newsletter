import type { PptxWorkerResponse } from './pptx-worker';

export type PptxSource = File | ArrayBuffer | Uint8Array | string;

export interface PptxViewerInstance {
  load: (source: PptxSource) => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  destroy: () => void;
}

interface HtmlPptxViewerOptions {
  width?: number;
  height?: number;
  onProgress?: (phase: 'download' | 'convert', pct: number) => void;
}

// ---------------------------------------------------------------------------
// Download with progress tracking
// ---------------------------------------------------------------------------

function fetchWithProgress(
  url: string,
  onProgress?: (pct: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    if (onProgress) {
      xhr.addEventListener('progress', (e) => {
        if (e.lengthComputable && e.total > 0) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as ArrayBuffer);
      } else {
        reject(new Error(`Failed to fetch presentation: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error fetching presentation')));
    xhr.addEventListener('abort', () => reject(new Error('Fetch aborted')));
    xhr.send();
  });
}

function toArrayBuffer(
  source: PptxSource,
  onProgress?: (pct: number) => void,
): Promise<ArrayBuffer> {
  if (source instanceof File) {
    return source.arrayBuffer();
  }

  if (source instanceof Uint8Array) {
    return Promise.resolve(source.slice().buffer);
  }

  if (source instanceof ArrayBuffer) {
    return Promise.resolve(source);
  }

  return fetchWithProgress(source, onProgress);
}

// ---------------------------------------------------------------------------
// Convert in a Web Worker
// ---------------------------------------------------------------------------

function convertInWorker(
  buffer: ArrayBuffer,
  width: number,
  height: number,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./pptx-worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.addEventListener('message', (e: MessageEvent<PptxWorkerResponse>) => {
      worker.terminate();
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data.slides ?? []);
      }
    });

    worker.addEventListener('error', (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Worker error'));
    });

    // Send a copy to the worker so the original buffer stays valid for fallback
    worker.postMessage({ buffer, width, height });
  });
}

class HtmlPptxViewer implements PptxViewerInstance {
  private container: HTMLElement;
  private options: HtmlPptxViewerOptions;
  private root: HTMLDivElement;
  private stage: HTMLDivElement;
  private controls: HTMLDivElement;
  private navGroup: HTMLDivElement;
  private actionsGroup: HTMLDivElement;
  private previousButton: HTMLButtonElement;
  private nextButton: HTMLButtonElement;
  private counter: HTMLSpanElement;
  private slides: string[] = [];
  private currentIndex = 0;
  private resizeObserver: ResizeObserver | null = null;
  private isFullscreen = false;

  constructor(container: HTMLElement, options: HtmlPptxViewerOptions = {}) {
    this.container = container;
    this.options = options;
    this.root = document.createElement('div');
    this.root.className = 'pptx-html-viewer';
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.root.style.width = '100%';
    this.root.style.position = 'relative';
    this.root.style.boxSizing = 'border-box';

    this.stage = document.createElement('div');
    this.stage.style.overflow = 'hidden';
    this.stage.style.background = '#FFFFFF';
    this.stage.style.padding = '0';

    this.controls = document.createElement('div');
    this.controls.setAttribute('data-pptx-controls', 'true');
    this.controls.style.display = 'flex';
    this.controls.style.alignItems = 'center';
    this.controls.style.justifyContent = 'space-between';
    this.controls.style.padding = '2px 8px';
    this.controls.style.borderTop = '1px solid #F0F0F0';
    this.controls.style.lineHeight = '1.2';

    this.previousButton = this.createControlButton('‹ Prev');
    this.nextButton = this.createControlButton('Next ›');
    this.counter = document.createElement('span');
    this.counter.style.fontSize = '13px';
    this.counter.style.fontWeight = '500';
    this.counter.style.color = '#525252';

    this.previousButton.addEventListener('click', this.handlePrevious);
    this.nextButton.addEventListener('click', this.handleNext);

    this.navGroup = document.createElement('div');
    this.navGroup.style.display = 'flex';
    this.navGroup.style.alignItems = 'center';
    this.navGroup.style.gap = '8px';
    this.navGroup.append(this.previousButton, this.counter, this.nextButton);

    this.actionsGroup = document.createElement('div');
    this.actionsGroup.setAttribute('data-pptx-actions', 'true');
    this.actionsGroup.style.display = 'flex';
    this.actionsGroup.style.alignItems = 'center';
    this.actionsGroup.style.gap = '8px';

    this.controls.append(this.navGroup, this.actionsGroup);
    this.root.append(this.stage, this.controls);

    this.container.innerHTML = '';
    this.container.appendChild(this.root);
    this.applyLayout();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.slides.length > 0) {
        this.rescaleCurrentSlide();
      }
    });
    this.resizeObserver.observe(this.stage);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  async load(source: PptxSource) {
    this.options.onProgress?.('download', 0);
    const buffer = await toArrayBuffer(source, (pct) => {
      this.options.onProgress?.('download', pct);
    });

    this.options.onProgress?.('convert', 0);
    try {
      this.slides = await convertInWorker(
        buffer,
        this.options.width ?? 960,
        this.options.height ?? 540,
      );
    } catch {
      // Worker failed (e.g. module import issue) – fall back to main thread
      const { pptxToHtml } = await import('@jvmr/pptx-to-html');
      this.slides = await pptxToHtml(buffer, {
        width: this.options.width ?? 960,
        height: this.options.height ?? 540,
        scaleToFit: true,
        letterbox: true,
      });
    }
    this.options.onProgress?.('convert', 100);
    this.currentIndex = 0;
    this.renderCurrentSlide();
  }

  async toggleFullscreen() {
    if (document.fullscreenElement === this.root) {
      await document.exitFullscreen();
      return;
    }

    await this.root.requestFullscreen();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    this.previousButton.removeEventListener('click', this.handlePrevious);
    this.nextButton.removeEventListener('click', this.handleNext);
    this.container.innerHTML = '';
    this.slides = [];
  }

  private createControlButton(label: string) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.border = '1px solid #E5E5E5';
    button.style.borderRadius = '6px';
    button.style.background = 'transparent';
    button.style.color = '#525252';
    button.style.padding = '1px 7px';
    button.style.fontSize = '12px';
    button.style.fontWeight = '500';
    button.style.lineHeight = '1.4';
    button.style.cursor = 'pointer';
    return button;
  }

  private handleFullscreenChange = () => {
    this.isFullscreen = document.fullscreenElement === this.root;
    this.applyLayout();
    this.rescaleCurrentSlide();
  };

  private applyLayout() {
    if (this.isFullscreen) {
      this.root.style.width = '100vw';
      this.root.style.height = '100vh';
      this.root.style.background = '#0F1115';
      this.root.style.padding = '0';

      this.stage.style.flex = '1 1 auto';
      this.stage.style.minHeight = '0';
      this.stage.style.display = 'flex';
      this.stage.style.alignItems = 'center';
      this.stage.style.justifyContent = 'center';
      this.stage.style.padding = '28px 28px 86px';
      this.stage.style.boxSizing = 'border-box';
      this.stage.style.background = '#0F1115';

      this.controls.style.position = 'absolute';
      this.controls.style.left = '50%';
      this.controls.style.right = 'auto';
      this.controls.style.bottom = '20px';
      this.controls.style.transform = 'translateX(-50%)';
      this.controls.style.width = 'auto';
      this.controls.style.maxWidth = 'calc(100vw - 32px)';
      this.controls.style.gap = '16px';
      this.controls.style.flexWrap = 'wrap';
      this.controls.style.justifyContent = 'center';
      this.controls.style.padding = '8px 10px';
      this.controls.style.border = '1px solid rgba(255,255,255,0.14)';
      this.controls.style.borderRadius = '12px';
      this.controls.style.background = 'rgba(20,22,28,0.92)';
      this.controls.style.boxShadow = '0 18px 60px rgba(0,0,0,0.35)';
      this.controls.style.backdropFilter = 'blur(12px)';

      this.counter.style.color = '#F5F5F5';
      this.applyControlTheme(true);
      return;
    }

    this.root.style.width = '100%';
    this.root.style.height = 'auto';
    this.root.style.background = 'transparent';
    this.root.style.padding = '0';

    this.stage.style.flex = '0 0 auto';
    this.stage.style.minHeight = '0';
    this.stage.style.display = 'block';
    this.stage.style.alignItems = '';
    this.stage.style.justifyContent = '';
    this.stage.style.padding = '0';
    this.stage.style.boxSizing = 'border-box';
    this.stage.style.background = '#FFFFFF';

    this.controls.style.position = 'static';
    this.controls.style.left = '';
    this.controls.style.right = '';
    this.controls.style.bottom = '';
    this.controls.style.transform = '';
    this.controls.style.width = 'auto';
    this.controls.style.maxWidth = '';
    this.controls.style.gap = '0';
    this.controls.style.flexWrap = 'nowrap';
    this.controls.style.justifyContent = 'space-between';
    this.controls.style.padding = '2px 8px';
    this.controls.style.border = '0';
    this.controls.style.borderTop = '1px solid #F0F0F0';
    this.controls.style.borderRadius = '0';
    this.controls.style.background = 'transparent';
    this.controls.style.boxShadow = 'none';
    this.controls.style.backdropFilter = '';

    this.counter.style.color = '#525252';
    this.applyControlTheme(false);
  }

  private applyControlTheme(isFullscreen: boolean) {
    const buttons = this.controls.querySelectorAll<HTMLButtonElement>('button');
    const links = this.controls.querySelectorAll<HTMLAnchorElement>('a');

    buttons.forEach((button) => {
      button.style.borderColor = isFullscreen ? 'rgba(255,255,255,0.18)' : '#E5E5E5';
      button.style.background = isFullscreen ? 'rgba(255,255,255,0.08)' : 'transparent';
      button.style.color = isFullscreen ? '#F5F5F5' : '#525252';

      if (button.dataset.pptxFullscreen === 'true') {
        button.textContent = isFullscreen
          ? button.dataset.pptxExitFullscreenLabel ?? button.textContent
          : button.dataset.pptxFullscreenLabel ?? button.textContent;
      }
    });

    links.forEach((link) => {
      link.style.color = isFullscreen ? '#F87171' : '#525252';
      link.style.textDecoration = 'none';
    });
  }

  private handlePrevious = () => {
    if (this.currentIndex > 0) {
      this.currentIndex -= 1;
      this.renderCurrentSlide();
    }
  };

  private handleNext = () => {
    if (this.currentIndex < this.slides.length - 1) {
      this.currentIndex += 1;
      this.renderCurrentSlide();
    }
  };

  private renderCurrentSlide() {
    const slide = this.slides[this.currentIndex] ?? '';

    // Wrap slide in a container that scales to fit the stage width
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.position = 'relative';

    const inner = document.createElement('div');
    inner.innerHTML = slide;
    inner.style.transformOrigin = 'top left';
    inner.style.width = `${this.options.width ?? 960}px`;
    wrapper.appendChild(inner);

    this.stage.innerHTML = '';
    this.stage.appendChild(wrapper);

    const { slideWidth, slideHeight, scale } = this.getSlideScale();
    inner.style.transform = `scale(${scale})`;
    wrapper.style.width = this.isFullscreen ? `${slideWidth * scale}px` : '100%';
    wrapper.style.height = `${slideHeight * scale}px`;

    this.counter.textContent = this.slides.length > 0 ? `${this.currentIndex + 1} / ${this.slides.length}` : '0 / 0';
    this.previousButton.disabled = this.currentIndex <= 0;
    this.nextButton.disabled = this.currentIndex >= this.slides.length - 1;
  }

  private rescaleCurrentSlide() {
    const inner = this.stage.querySelector<HTMLElement>(':scope > div > div');
    const wrapper = this.stage.querySelector<HTMLElement>(':scope > div');
    if (!inner || !wrapper) return;

    const { slideWidth, slideHeight, scale } = this.getSlideScale();
    inner.style.transform = `scale(${scale})`;
    wrapper.style.width = this.isFullscreen ? `${slideWidth * scale}px` : '100%';
    wrapper.style.height = `${slideHeight * scale}px`;
  }

  private getSlideScale() {
    const slideWidth = this.options.width ?? 960;
    const slideHeight = this.options.height ?? 540;
    const stageStyle = getComputedStyle(this.stage);
    const horizontalPadding = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
    const verticalPadding = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
    const availableWidth = Math.max(1, this.stage.clientWidth - horizontalPadding);
    const availableHeight = Math.max(1, this.stage.clientHeight - verticalPadding);

    const scale = this.isFullscreen
      ? Math.min(availableWidth / slideWidth, availableHeight / slideHeight)
      : Math.min(1, availableWidth / slideWidth);

    return { slideWidth, slideHeight, scale };
  }
}

export async function createPptxViewer(
  container: HTMLElement,
  source: PptxSource,
  options: HtmlPptxViewerOptions = {},
): Promise<PptxViewerInstance> {
  const viewer = new HtmlPptxViewer(container, options);
  await viewer.load(source);
  return viewer;
}
