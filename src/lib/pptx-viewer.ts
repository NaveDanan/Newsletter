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
  private previousButton: HTMLButtonElement;
  private nextButton: HTMLButtonElement;
  private counter: HTMLSpanElement;
  private slides: string[] = [];
  private currentIndex = 0;

  constructor(container: HTMLElement, options: HtmlPptxViewerOptions = {}) {
    this.container = container;
    this.options = options;
    this.root = document.createElement('div');
    this.root.className = 'pptx-html-viewer';
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.root.style.gap = '12px';
    this.root.style.width = '100%';

    this.stage = document.createElement('div');
    this.stage.style.minHeight = `${this.options.height ?? 540}px`;
    this.stage.style.border = '1px solid #E5E5E5';
    this.stage.style.borderRadius = '12px';
    this.stage.style.overflow = 'auto';
    this.stage.style.background = '#F8FAFC';
    this.stage.style.padding = '12px';

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.justifyContent = 'center';
    controls.style.gap = '12px';

    this.previousButton = this.createControlButton('Prev');
    this.nextButton = this.createControlButton('Next');
    this.counter = document.createElement('span');
    this.counter.style.fontSize = '13px';
    this.counter.style.fontWeight = '600';
    this.counter.style.color = '#525252';

    this.previousButton.addEventListener('click', this.handlePrevious);
    this.nextButton.addEventListener('click', this.handleNext);

    controls.append(this.previousButton, this.counter, this.nextButton);
    this.root.append(this.stage, controls);

    this.container.innerHTML = '';
    this.container.appendChild(this.root);
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
    this.previousButton.removeEventListener('click', this.handlePrevious);
    this.nextButton.removeEventListener('click', this.handleNext);
    this.container.innerHTML = '';
    this.slides = [];
  }

  private createControlButton(label: string) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.border = '1px solid #D4D4D4';
    button.style.borderRadius = '999px';
    button.style.background = '#FFFFFF';
    button.style.color = '#171717';
    button.style.padding = '6px 12px';
    button.style.fontSize = '12px';
    button.style.fontWeight = '600';
    button.style.cursor = 'pointer';
    return button;
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
    this.stage.innerHTML = slide;
    this.counter.textContent = this.slides.length > 0 ? `${this.currentIndex + 1} / ${this.slides.length}` : '0 / 0';
    this.previousButton.disabled = this.currentIndex <= 0;
    this.nextButton.disabled = this.currentIndex >= this.slides.length - 1;
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