import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn(), register: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) } }) }));
vi.mock("@/app/account/documents/actions", () => ({ prepareCurrentUpload: mocks.prepare, prepareUpload: mocks.prepare, registerDocument: mocks.register }));
import { uploadLease } from "@/lib/upload-lease";
it("uploads the selected original and registers it only after successful storage", async () => {
  const file = new File(["%PDF-test"], "synthetic.pdf", { type: "application/pdf" });
  mocks.prepare.mockResolvedValue({ path: "owner/move/doc.pdf", token: "test-only", documentId: "doc", moveId: "move" });
  mocks.upload.mockResolvedValue({ error: null }); mocks.register.mockResolvedValue({ message: "Read" });
  await uploadLease(file);
  expect(mocks.upload).toHaveBeenCalledWith("owner/move/doc.pdf", "test-only", file, { contentType: "application/pdf" });
  expect(mocks.register).toHaveBeenCalledWith({ documentId: "doc", moveId: "move", name: "synthetic.pdf" });
  mocks.register.mockClear(); mocks.upload.mockResolvedValue({ error: new Error("Upload failed") });
  await expect(uploadLease(file)).rejects.toThrow("Upload failed"); expect(mocks.register).not.toHaveBeenCalled();
});
