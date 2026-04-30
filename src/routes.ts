import { AGENTS, getAgent } from "./agents/prompts";
import type { AppConfig } from "./config";
import type { AgentId } from "./domain/types";
import { FileStore } from "./storage/store";
import { HttpError, json, notFound, readJson } from "./utils/http";
import type { ProjectService } from "./services/project-service";
import type { CreateSessionInput, SessionService } from "./services/session-service";
import { checkDockerAvailability } from "./sandbox/docker-availability";

export type AppServices = {
  config: AppConfig;
  store: FileStore;
  projects: ProjectService;
  sessions: SessionService;
};

export async function route(request: Request, services: AppServices): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (request.method === "GET" && path === "/health") {
      const docker =
        services.config.sandboxProvider === "docker"
          ? await checkDockerAvailability()
          : { available: services.config.allowMockSandbox, reason: "mock sandbox provider" };

      return json({
        ok: true,
        sandboxProvider: services.config.sandboxProvider,
        sandboxAvailable: docker.available,
        sandboxDetail: docker,
        hostExecutionAllowed: false,
        artifactRoot: services.config.artifactRoot
      });
    }

    if (request.method === "GET" && path === "/api/agents") {
      return json({
        agents: AGENTS.map(({ systemPrompt, ...agent }) => ({
          ...agent,
          promptEndpoint: `/api/agents/${agent.id}/prompt`
        }))
      });
    }

    const agentPromptMatch = path.match(/^\/api\/agents\/([^/]+)\/prompt$/);
    if (request.method === "GET" && agentPromptMatch) {
      const agent = getAgent(agentPromptMatch[1] as AgentId);
      if (!agent) return notFound();
      return json(agent);
    }

    if (request.method === "POST" && path === "/api/projects") {
      const body = await readJson<Parameters<ProjectService["createProject"]>[0]>(request);
      const project = await services.projects.createProject(body);
      return json(project, { status: 201 });
    }

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (request.method === "GET" && projectMatch) {
      const project = await services.store.getProject(projectMatch[1]);
      return project ? json(project) : notFound();
    }

    if (request.method === "POST" && path === "/api/sessions") {
      if (services.config.sandboxProvider === "docker") {
        const docker = await checkDockerAvailability();
        if (!docker.available) {
          throw new HttpError(503, "Sandbox unavailable. Docker Engine is required before sessions can run.", docker);
        }
      }

      const body = await readJson<CreateSessionInput>(request);
      const session = await services.sessions.createSession(body);
      return json(session, { status: 202 });
    }

    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (request.method === "GET" && sessionMatch) {
      const session = await services.store.getSession(sessionMatch[1]);
      return session ? json(session) : notFound();
    }

    const eventsMatch = path.match(/^\/api\/sessions\/([^/]+)\/events$/);
    if (request.method === "GET" && eventsMatch) {
      return json({ events: await services.store.getEvents(eventsMatch[1]) });
    }

    const reportMatch = path.match(/^\/api\/sessions\/([^/]+)\/report$/);
    if (request.method === "GET" && reportMatch) {
      const report = await services.store.getReport(reportMatch[1]);
      return report ? json(report) : notFound();
    }

    return notFound();
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message, details: error.details }, { status: error.status });
    }

    return json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
