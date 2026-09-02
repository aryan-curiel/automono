import { describe, expect, it } from "vitest";
import { isIngestableReceipt, receiptsToIngest } from "./receiptInbox";

describe("isIngestableReceipt", () => {
  it("accepts supported receipt extensions, case-insensitively", () => {
    expect(isIngestableReceipt("/inbox/factura.pdf")).toBe(true);
    expect(isIngestableReceipt("/inbox/FOTO.JPG")).toBe(true);
    expect(isIngestableReceipt("/inbox/scan.jpeg")).toBe(true);
    expect(isIngestableReceipt("C:\\inbox\\ticket.PNG")).toBe(true);
  });

  it("rejects unsupported types, dotfiles and extensionless files", () => {
    expect(isIngestableReceipt("/inbox/notas.txt")).toBe(false);
    expect(isIngestableReceipt("/inbox/.DS_Store")).toBe(false);
    expect(isIngestableReceipt("/inbox/receipt.pdf.crdownload")).toBe(false);
    expect(isIngestableReceipt("/inbox/README")).toBe(false);
    expect(isIngestableReceipt("")).toBe(false);
  });
});

describe("receiptsToIngest", () => {
  it("returns supported files not already queued (dedupe by basename)", () => {
    const scanned = [
      "/inbox/a.pdf",
      "/inbox/b.jpg",
      "/inbox/notes.txt",
      "/inbox/.DS_Store",
      "/inbox/c.png",
    ];
    expect(receiptsToIngest(scanned, ["b.jpg"])).toEqual(["/inbox/a.pdf", "/inbox/c.png"]);
  });

  it("is empty when everything scanned is already queued", () => {
    expect(receiptsToIngest(["/inbox/a.pdf", "/inbox/b.pdf"], ["a.pdf", "b.pdf"])).toEqual([]);
  });

  it("ingests everything on a settled folder with an empty queue", () => {
    expect(receiptsToIngest(["/x/1.pdf", "/x/2.png"], [])).toEqual(["/x/1.pdf", "/x/2.png"]);
  });
});
