# Cloud Cyber Range Backend

Backend-only Bun prototype for safely analyzing uploaded code with agent-defined workflows and sandboxed execution.

The server does not execute uploaded code on the host. Analysis sessions are routed through a `SandboxProvider`; the default provider is Docker with `--network none`, memory/CPU limits, a non-root user inside the image, a read-only root filesystem, and a per-session workspace mount.

## Commands

```bash
bun install
bun run sandbox:check
bun run sandbox:build
bun run doctor
bun run dev
bun run check
bun test
```

## API

- `GET /health` - service status and sandbox mode
- `GET /api/agents` - agent definitions and system prompt metadata
- `GET /api/agents/:agentId/prompt` - full system prompt for a specific agent
- `POST /api/projects` - register uploaded source files
- `GET /api/projects/:projectId` - project metadata
- `POST /api/sessions` - start an analysis session
- `GET /api/sessions/:sessionId` - session status and report summary
- `GET /api/sessions/:sessionId/events` - JSONL-style event replay
- `GET /api/sessions/:sessionId/report` - final analysis report

## Upload Shape

`POST /api/projects`

```json
{
  "name": "acme-api",
  "company": "Acme",
  "files": [
    {
      "path": "package.json",
      "contentBase64": "eyJzY3JpcHRzIjp7InRlc3QiOiJidW4gdGVzdCJ9fQ=="
    }
  ]
}
```

Only relative file paths are accepted. Absolute paths, parent traversal, oversized uploads, and unsafe control characters are rejected.

## Start Analysis

`POST /api/sessions`

```json
{
  "projectId": "project_...",
  "requestedBy": "security-team",
  "profile": "standard",
  "agents": ["intake-agent", "test-planner-agent", "sandbox-runner-agent", "security-review-agent"]
}
```

The sandbox runner currently executes only allowlisted commands inside the sandbox. If Docker is unavailable, the session fails closed instead of falling back to host execution.

If Docker Engine is not running, `POST /api/sessions` returns `503` with sandbox readiness details. The API still serves health, project upload, agent, prompt, and report endpoints.

## Sandbox Notes

Build the local sandbox image before running real sessions:

```bash
bun run sandbox:check
bun run sandbox:build
```

The backend intentionally has no host fallback. `SANDBOX_PROVIDER=mock` exists only for service tests and requires `ALLOW_MOCK_SANDBOX=true`.

On Windows, install and start Docker Desktop first. `docker --version` must work in the same PowerShell session before `bun run sandbox:build` can succeed.
