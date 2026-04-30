import { strict as assert } from "node:assert";
import { route } from "../src/routes";
import { assertSafeRelativePath } from "../src/security/path-policy";
import { validateUploadFiles } from "../src/security/upload-policy";
import { assertAllowedSandboxCommand } from "../src/sandbox/policy";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  {
    name: "path policy rejects traversal and absolute paths",
    run: () => {
      assert.throws(() => assertSafeRelativePath("../secret.txt"));
      assert.throws(() => assertSafeRelativePath("C:\\Users\\secret.txt"));
      assert.throws(() => assertSafeRelativePath("/etc/passwd"));
    }
  },
  {
    name: "path policy allows normal project files",
    run: () => {
      assert.equal(assertSafeRelativePath("src/index.ts").replaceAll("\\", "/"), "src/index.ts");
    }
  },
  {
    name: "upload policy rejects duplicates and max byte violations",
    run: () => {
      const contentBase64 = Buffer.from("x").toString("base64");
      assert.throws(() =>
        validateUploadFiles(
          [
            { path: "a.ts", contentBase64 },
            { path: "a.ts", contentBase64 }
          ],
          100
        )
      );
      assert.throws(() => validateUploadFiles([{ path: "a.ts", contentBase64 }], 0));
    }
  },
  {
    name: "sandbox command policy rejects privileged or host-shaped commands",
    run: () => {
      assert.throws(() =>
        assertAllowedSandboxCommand({
          id: "bad",
          command: ["docker", "run", "--privileged"],
          timeoutSeconds: 10
        })
      );
      assert.throws(() =>
        assertAllowedSandboxCommand({
          id: "bad-volume",
          command: ["bun", "test", "-v", "/:/host"],
          timeoutSeconds: 10
        })
      );
    }
  },
  {
    name: "sandbox command policy allows bounded Bun test command",
    run: () => {
      assert.doesNotThrow(() =>
        assertAllowedSandboxCommand({
          id: "bun-test",
          command: ["bun", "test"],
          timeoutSeconds: 120
        })
      );
    }
  },
  {
    name: "session endpoint fails closed when sandbox is unavailable",
    run: async () => {
      const response = await route(
        new Request("http://127.0.0.1:8787/api/sessions", {
          method: "POST",
          body: JSON.stringify({ projectId: "project_test" }),
          headers: { "content-type": "application/json" }
        }),
        {
          config: {
            port: 8787,
            artifactRoot: "artifacts",
            sandboxProvider: "docker",
            sandboxImage: "bun-sandbox:latest",
            maxUploadBytes: 1024,
            maxSessionSeconds: 600,
            allowMockSandbox: false
          },
          store: {} as never,
          projects: {} as never,
          sessions: {
            createSession: () => {
              throw new Error("createSession must not run when sandbox is unavailable");
            }
          } as never
        }
      );

      assert.equal(response.status, 503);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /Sandbox unavailable/);
    }
  }
];

let failures = 0;

for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${test.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`${failures}/${tests.length} tests failed.`);
  process.exit(1);
}

console.log(`${tests.length}/${tests.length} tests passed.`);
