import { loadConfig } from "./config";
import { DockerSandboxProvider } from "./sandbox/docker-provider";
import { MockSandboxProvider } from "./sandbox/mock-provider";
import type { SandboxProvider } from "./sandbox/provider";
import { ProjectService } from "./services/project-service";
import { SessionService } from "./services/session-service";
import { FileStore } from "./storage/store";
import { route } from "./routes";

const config = loadConfig();
const store = new FileStore(config.artifactRoot);
await store.ensureReady();

const sandboxProvider = createSandboxProvider();
const projects = new ProjectService(store, config);
const sessions = new SessionService(store, projects, sandboxProvider, config);

let server: ReturnType<typeof Bun.serve>;

try {
  server = Bun.serve({
    port: config.port,
    async fetch(request) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      const response = await route(request, {
        config,
        store,
        projects,
        sessions
      });

      for (const [key, value] of Object.entries(corsHeaders())) {
        response.headers.set(key, value);
      }
      return response;
    }
  });
} catch (error) {
  if (error instanceof Error && error.message.includes("Failed to start server")) {
    console.error(`Port ${config.port} is already in use. Stop the existing backend or set PORT to another value.`);
    process.exit(1);
  }

  throw error;
}

console.log(`Cloud Cyber Range backend listening on http://127.0.0.1:${server.port}`);
console.log(`Sandbox provider: ${sandboxProvider.providerName}. Host execution allowed: false.`);

function createSandboxProvider(): SandboxProvider {
  if (config.sandboxProvider === "mock") {
    if (!config.allowMockSandbox) {
      throw new Error("Mock sandbox requires ALLOW_MOCK_SANDBOX=true and must not be used for real uploads.");
    }
    return new MockSandboxProvider();
  }

  return new DockerSandboxProvider(config.sandboxImage);
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  };
}
