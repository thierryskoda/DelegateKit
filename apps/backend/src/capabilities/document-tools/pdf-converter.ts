import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { libreOfficeBinary } from "../../shared/env";

const execFileAsync = promisify(execFile);

export interface DocumentPdfConverter {
  convert(bytes: Uint8Array, extension: string): Promise<Uint8Array>;
}

function createLibreOfficePdfConverter(
  input: { sofficeCommand?: string } = {},
): DocumentPdfConverter {
  const command = input.sofficeCommand || libreOfficeBinary();

  return {
    async convert(bytes: Uint8Array, extension: string): Promise<Uint8Array> {
      const dir = await mkdtemp(path.join(tmpdir(), "document-render-"));
      const inputPath = path.join(dir, `preview${extension}`);
      const outputPath = path.join(dir, "preview.pdf");

      try {
        await writeFile(inputPath, bytes);

        try {
          await execFileAsync(
            command,
            ["--headless", "--convert-to", "pdf", "--outdir", dir, inputPath],
            {
              timeout: 60_000,
              maxBuffer: 1024 * 1024,
            },
          );
        } catch (error: any) {
          const message = error instanceof Error ? error.message : String(error);
          
          if (error?.code === "ENOENT") {
            throw new DomainError(
              domainCodes.INTERNAL,
              `LibreOffice binary not found at ${command}. Check deployment configuration.`,
              { cause: error }
            );
          }
          if (error?.killed && error?.signal === "SIGTERM") {
            throw new DomainError(
              domainCodes.SERVICE_UNAVAILABLE,
              `Document to PDF conversion timed out after 60 seconds.`,
              { cause: error }
            );
          }
          if (message.includes("source file could not be loaded")) {
             throw new DomainError(
              domainCodes.BAD_REQUEST,
              `The document could not be loaded. It may be corrupt or an unsupported format.`,
              { cause: error }
            );
          }
          
          throw new DomainError(
            domainCodes.INTERNAL,
            `Document to PDF conversion failed using ${command}: ${message}`,
            { cause: error }
          );
        }

        try {
          return new Uint8Array(await readFile(outputPath));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new DomainError(
            domainCodes.INTERNAL,
            `Document to PDF conversion did not produce a PDF output: ${message}`,
            { cause: error }
          );
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

export const defaultDocumentPdfConverter = createLibreOfficePdfConverter();
