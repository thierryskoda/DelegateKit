import { createCanvas } from "@napi-rs/canvas";
import { DomainError, domainCodes } from "@ai-assistants/errors";

type PdfJsModule = {
  getDocument(input: { data: Uint8Array; disableWorker: true }): {
    promise: Promise<PdfDocument>;
  };
};

type PdfDocument = {
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

export type PdfPreviewRenderResult = {
  pngBytes: Uint8Array;
  pageNumber: 1;
  widthPx: number;
  heightPx: number;
  renderer: "pdfjs";
};

const PREVIEW_SCALE = 1.5;

async function loadPdfJs(): Promise<PdfJsModule> {
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
}

export async function renderFirstPagePdfPreview(
  pdfBytes: Uint8Array,
): Promise<PdfPreviewRenderResult> {
  const pdfjs = await loadPdfJs();
  let document: PdfDocument;
  try {
    document = await pdfjs.getDocument({ data: pdfBytes, disableWorker: true }).promise;
  } catch (error) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "PDF artifact could not be loaded for preview.",
      {
        cause: error,
      },
    );
  }

  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: PREVIEW_SCALE });
    const widthPx = Math.ceil(viewport.width);
    const heightPx = Math.ceil(viewport.height);
    if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx < 1 || heightPx < 1) {
      throw new DomainError(
        domainCodes.INTERNAL,
        "PDF preview renderer returned invalid dimensions.",
      );
    }

    const canvas = createCanvas(widthPx, heightPx);
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, widthPx, heightPx);
    await page.render({
      canvas: null,
      canvasContext: context,
      viewport,
    }).promise;

    return {
      pngBytes: new Uint8Array(await canvas.encode("png")),
      pageNumber: 1,
      widthPx,
      heightPx,
      renderer: "pdfjs",
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(domainCodes.INTERNAL, "PDF preview rendering failed.", { cause: error });
  } finally {
    await document.destroy();
  }
}
