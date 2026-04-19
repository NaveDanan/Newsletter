import { pptxToHtml } from '@jvmr/pptx-to-html';
import { DOMParser } from '@xmldom/xmldom';

export interface PptxWorkerRequest {
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface PptxWorkerResponse {
  slides?: string[];
  error?: string;
}

self.addEventListener('message', async (e: MessageEvent<PptxWorkerRequest>) => {
  try {
    const { buffer, width, height } = e.data;
    const slides = await pptxToHtml(buffer, {
      width,
      height,
      scaleToFit: true,
      letterbox: true,
      domParserFactory: () => new DOMParser() as unknown as globalThis.DOMParser,
    });
    (self as unknown as Worker).postMessage({ slides } satisfies PptxWorkerResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PPTX conversion failed';
    (self as unknown as Worker).postMessage({ error: message } satisfies PptxWorkerResponse);
  }
});
