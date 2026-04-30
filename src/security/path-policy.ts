import { normalize, sep } from "node:path";

const WINDOWS_DRIVE = /^[a-zA-Z]:/;
const UNSAFE_SEGMENTS = new Set(["", ".", ".."]);

export function assertSafeRelativePath(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error("File path is required");
  }

  if (input.includes("\0") || input.includes("\r") || input.includes("\n")) {
    throw new Error(`Unsafe control character in path: ${input}`);
  }

  const normalized = normalize(input).replaceAll("\\", "/");
  if (normalized.startsWith("/") || WINDOWS_DRIVE.test(normalized)) {
    throw new Error(`Absolute paths are not allowed: ${input}`);
  }

  const parts = normalized.split("/");
  if (parts.some((part) => UNSAFE_SEGMENTS.has(part))) {
    throw new Error(`Path traversal is not allowed: ${input}`);
  }

  return parts.join(sep);
}
