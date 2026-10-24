// Run from web/: npx tsx ../fixtures/synthetic/generate-lease.ts
// Minimal deterministic PDF writer: no external dependencies or real user data.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SYNTHETIC_LEASE_PAGES } from "./lease-pages";
export function syntheticPdf(pages: string[]): Buffer {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (const page of pages) {
    const contentId = objects.length + 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    const lines = page.match(/.{1,85}(?:\s|$)/g) ?? [];
    const content = `BT /F1 11 Tf 40 740 Td 15 TL\n${lines.map(l => `(${l.trim().replace(/[\\()]/g, "\\$&")}) Tj T*`).join("\n")}\nET`;
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL("./lease.pdf", import.meta.url), syntheticPdf(SYNTHETIC_LEASE_PAGES));
}
