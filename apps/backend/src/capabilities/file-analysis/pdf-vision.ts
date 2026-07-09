import { createCanvas } from "@napi-rs/canvas";
import { DomainError, domainCodes } from "@ai-assistants/errors";

type PdfJsModule = {
  getDocument(input: { data: Uint8Array; disableWorker: true }): {
    promise: Promise<PdfDocument>;
  };
};

type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};

type PdfPage = {
  getViewport(input: { scale: number }): PdfViewport;
  render(input: { canvas: null; canvasContext: unknown; viewport: PdfViewport }): {
    promise: Promise<void>;
  };
};

type PdfViewport = {
  width: number;
  height: number;
};

export type VisionImagePart = {
  mimeType: string;
  base64: string;
  label: string;
};

export type RenderedPdfPages = {
  images: VisionImagePart[];
  pageCount: number;
  pagesRendered: number;
  truncated: boolean;
};

const PDF_RENDER_SCALE = 1.5;
const MAX_VISION_PDF_PAGES = 3;

async function loadPdfJs(): Promise<PdfJsModule> {
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
}

export async function renderPdfPagesForVision(pdfBytes: Uint8Array): Promise<RenderedPdfPages> {
  const pdfjs = await loadPdfJs();
  let document: PdfDocument;
  try {
    document = await pdfjs.getDocument({ data: pdfBytes, disableWorker: true }).promise;
  } catch (error) {
    throw new DomainError(domainCodes.BAD_REQUEST, "PDF file could not be loaded for visual analysis.", {
      cause: error,
    });
  }

  const pageCount = document.numPages;
  const pagesToRender = Math.min(pageCount, MAX_VISION_PDF_PAGES);
  const images: VisionImagePart[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const widthPx = Math.ceil(viewport.width);
      const heightPx = Math.ceil(viewport.height);
      if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx < 1 || heightPx < 1) {
        throw new DomainError(domainCodes.INTERNAL, "PDF visual renderer returned invalid dimensions.");
      }
      const canvas = createCanvas(widthPx, heightPx);
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, widthPx, heightPx);
      await page.render({ canvas: null, canvasContext: context, viewport }).promise;
      images.push({
        mimeType: "image/png",
        base64: Buffer.from(await canvas.encode("png")).toString("base64"),
        label: `PDF page ${pageNumber}`,
      });
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(domainCodes.INTERNAL, "PDF visual rendering failed.", { cause: error });
  } finally {
    await document.destroy();
  }

  return {
    images,
    pageCount,
    pagesRendered: pagesToRender,
    truncated: pageCount > pagesToRender,
  };
}
