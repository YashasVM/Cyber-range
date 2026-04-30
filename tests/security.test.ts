import { describe, expect, test } from "bun:test";
import { assertSafeRelativePath } from "../src/security/path-policy";
import { validateUploadFiles } from "../src/security/upload-policy";
import { assertAllowedSandboxCommand } from "../src/sandbox/policy";

describe("path policy", () => {
  test("rejects traversal and absolute paths", () => {
    expect(() => assertSafeRelativePath("../secret.txt")).toThrow();
    expect(() => assertSafeRelativePath("C:\\Users\\secret.txt")).toThrow();
    expect(() => assertSafeRelativePath("/etc/passwd")).toThrow();
  });

  test("allows normal relative project files", () => {
    expect(assertSafeRelativePath("src/index.ts").replaceAll("\\", "/")).toBe("src/index.ts");
  });
});

describe("upload policy", () => {
  test("rejects duplicate files and max byte violations", () => {
    const contentBase64 = Buffer.from("x").toString("base64");
    expect(() =>
      validateUploadFiles(
        [
          { path: "a.ts", contentBase64 },
          { path: "a.ts", contentBase64 }
        ],
        100
      )
    ).toThrow();
    expect(() => validateUploadFiles([{ path: "a.ts", contentBase64 }], 0)).toThrow();
  });
});

describe("sandbox command policy", () => {
  test("rejects privileged or host-shaped commands", () => {
    expect(() =>
      assertAllowedSandboxCommand({
        id: "bad",
        command: ["docker", "run", "--privileged"],
        timeoutSeconds: 10
      })
    ).toThrow();
    expect(() =>
      assertAllowedSandboxCommand({
        id: "bad-volume",
        command: ["bun", "test", "-v", "/:/host"],
        timeoutSeconds: 10
      })
    ).toThrow();
  });

  test("allows bounded Bun test command", () => {
    expect(() =>
      assertAllowedSandboxCommand({
        id: "bun-test",
        command: ["bun", "test"],
        timeoutSeconds: 120
      })
    ).not.toThrow();
  });
});
