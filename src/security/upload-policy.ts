import type { UploadedFile } from "../domain/types";
import { assertSafeRelativePath } from "./path-policy";

export type ValidatedUpload = {
  path: string;
  bytes: Uint8Array;
};

export function validateUploadFiles(files: UploadedFile[], maxBytes: number): ValidatedUpload[] {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("At least one file is required");
  }

  let total = 0;
  const seen = new Set<string>();

  return files.map((file) => {
    const path = assertSafeRelativePath(file.path);
    if (seen.has(path)) {
      throw new Error(`Duplicate upload path: ${file.path}`);
    }
    seen.add(path);

    const bytes = Uint8Array.from(Buffer.from(file.contentBase64, "base64"));
    total += bytes.byteLength;
    if (total > maxBytes) {
      throw new Error(`Upload exceeds ${maxBytes} byte limit`);
    }

    return { path, bytes };
  });
}
