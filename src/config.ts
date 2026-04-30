import { resolve } from "node:path";

export type AppConfig = {
  port: number;
  artifactRoot: string;
  sandboxProvider: "docker" | "mock";
  sandboxImage: string;
  maxUploadBytes: number;
  maxSessionSeconds: number;
  allowMockSandbox: boolean;
};

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  const provider = process.env.SANDBOX_PROVIDER ?? "docker";
  if (provider !== "docker" && provider !== "mock") {
    throw new Error("SANDBOX_PROVIDER must be docker or mock");
  }

  return {
    port: readNumber("PORT", 8787),
    artifactRoot: resolve(process.env.ARTIFACT_ROOT ?? "./artifacts"),
    sandboxProvider: provider,
    sandboxImage: process.env.SANDBOX_IMAGE ?? "bun-sandbox:latest",
    maxUploadBytes: readNumber("MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
    maxSessionSeconds: readNumber("MAX_SESSION_SECONDS", 600),
    allowMockSandbox: process.env.ALLOW_MOCK_SANDBOX === "true"
  };
}
