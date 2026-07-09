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
  getTextContent(): Promise<PdfTextContent>;
};

type PdfTextContent = {
  items: PdfTextItem[];
};

type PdfTextItem = {
  str?: unknown;
};

export type PdfTextExtractionResult = {
  text: string;
  pageCount: number;
  pagesAnalyzed: number;
  truncated: boolean;
};

const MAX_EXTRACTED_TEXT_CHARS = 80_000;

async function loadPdfJs(): Promise<PdfJsModule> {
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
}

function appendBoundedText(current: string, addition: string): { text: string; truncated: boolean } {
  if (!addition) return { text: current, truncated: false };
  const remaining = MAX_EXTRACTED_TEXT_CHARS - current.length;
  if (remaining <= 0) return { text: current, truncated: true };
  if (addition.length > remaining) {
    return { text: `${current}${addition.slice(0, remaining)}`, truncated: true };
  }
  return { text: `${current}${addition}`, truncated: false };
}

export async function extractPdfEmbeddedText(pdfBytes: Uint8Array): Promise<PdfTextExtractionResult> {
  const pdfjs = await loadPdfJs();
  let document: PdfDocument;
  try {
    document = await pdfjs.getDocument({ data: pdfBytes, disableWorker: true }).promise;
  } catch (error) {
    throw new DomainError(domainCodes.BAD_REQUEST, "PDF file could not be loaded.", { cause: error });
  }

  let text = "";
  let truncated = false;
  let pagesAnalyzed = 0;
  const pageCount = document.numPages;
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => (typeof item.str === "string" ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim();
      if (pageText) {
        const separator = text ? "\n\n" : "";
        const appended = appendBoundedText(text, `${separator}[Page ${pageNumber}]\n${pageText}`);
        text = appended.text;
        truncated = appended.truncated;
      }
      pagesAnalyzed = pageNumber;
      if (truncated) break;
    }
  } catch (error) {
    throw new DomainError(domainCodes.INTERNAL, "PDF text extraction failed.", { cause: error });
  } finally {
    await document.destroy();
  }

  return { text: text.trim(), pageCount, pagesAnalyzed, truncated };
}
