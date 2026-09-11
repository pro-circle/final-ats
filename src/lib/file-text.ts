/**
 * Browser-side document text extraction.
 *
 * Supports the formats candidates actually have their resume in:
 *   • PDF  — parsed page by page with pdf.js
 *   • DOCX — converted to raw text with mammoth
 *   • TXT / MD / RTF / CSV / JSON — read directly
 *
 * Legacy binary `.doc` cannot be read in the browser; we say so plainly
 * instead of importing gibberish.
 */

const MAX_BYTES = 10 * 1024 * 1024;

export type ExtractProgress = (stage: string, percent: number) => void;

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function clean(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromPdf(file: File, onProgress?: ExtractProgress): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Bundled worker — no CDN, works offline and on any host.
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as { str?: string; hasEOL?: boolean }[];
    let line = "";
    const lines: string[] = [];
    for (const item of items) {
      line += item.str ?? "";
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
    onProgress?.(`Reading page ${i} of ${doc.numPages}`, Math.round((i / doc.numPages) * 100));
  }
  return clean(pages.join("\n\n"));
}

type MammothBrowser = {
  extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
};

async function fromDocx(file: File): Promise<string> {
  const mod = (await import(
    /* @vite-ignore */ "mammoth/mammoth.browser.js"
  )) as unknown as MammothBrowser & { default?: MammothBrowser };
  const mammoth = mod.default ?? mod;
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return clean(result.value ?? "");
}

/** The accept attribute for resume upload inputs. */
export const RESUME_ACCEPT =
  ".pdf,.docx,.txt,.md,.rtf,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export async function extractTextFromFile(
  file: File,
  onProgress?: ExtractProgress,
): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("That file is larger than 10 MB.");
  const ext = extensionOf(file.name);
  const type = file.type;

  onProgress?.("Opening your file", 8);

  if (ext === "pdf" || type === "application/pdf") {
    const text = await fromPdf(file, onProgress);
    if (text.length < 20)
      throw new Error(
        "This PDF has no selectable text — it looks like a scan. Paste the text below instead.",
      );
    return text;
  }

  if (ext === "docx" || type.includes("wordprocessingml")) {
    onProgress?.("Reading the Word document", 45);
    const text = await fromDocx(file);
    if (text.length < 20) throw new Error("That Word document appears to be empty.");
    return text;
  }

  if (ext === "doc" || type === "application/msword") {
    throw new Error(
      "Old .doc files can't be read here. Save it as .docx or PDF and upload again.",
    );
  }

  onProgress?.("Reading the text", 60);
  const text = clean(await file.text());
  if (!text) throw new Error("That file is empty.");
  return text;
}
