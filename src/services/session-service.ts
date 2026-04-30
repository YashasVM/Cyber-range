import { mkdir } from "node:fs/promises";
import type { AppConfig } from "../config";
import type { AgentFinding, AgentId, AnalysisReport, Session, SessionEvent } from "../domain/types";
import { DEFAULT_COMMAND_PLAN } from "../agents/prompts";
import { FileStore } from "../storage/store";
import type { SandboxProvider } from "../sandbox/provider";
import { makeId, nowIso } from "../utils/ids";
import { ProjectService } from "./project-service";

export type CreateSessionInput = {
  projectId: string;
  requestedBy?: string;
  profile?: "standard" | "deep";
  agents?: AgentId[];
};

const DEFAULT_AGENTS: AgentId[] = [
  "intake-agent",
  "test-planner-agent",
  "sandbox-runner-agent",
  "security-review-agent",
  "report-agent"
];

export class SessionService {
  constructor(
    private readonly store: FileStore,
    private readonly projectService: ProjectService,
    private readonly sandboxProvider: SandboxProvider,
    private readonly config: AppConfig
  ) {}

  async createSession(input: CreateSessionInput): Promise<Session> {
    const project = await this.store.getProject(input.projectId);
    if (!project) {
      throw new Error(`Unknown projectId: ${input.projectId}`);
    }

    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + this.config.maxSessionSeconds * 1000).toISOString();
    const sessionId = makeId("session");
    const session: Session = {
      sessionId,
      projectId: project.projectId,
      requestedBy: input.requestedBy ?? "anonymous",
      profile: input.profile ?? "standard",
      status: "CREATED",
      phase: "SESSION_CREATED",
      createdAt,
      expiresAt,
      artifactPrefix: `sessions/${sessionId}`,
      agentIds: input.agents?.length ? input.agents : DEFAULT_AGENTS
    };

    await this.store.createSession(session);
    this.runSession(session.sessionId).catch(async (error) => {
      const current = await this.store.getSession(session.sessionId);
      if (!current) return;
      current.status = "FAILED";
      current.phase = "SESSION_FAILED";
      current.failureReason = error instanceof Error ? error.message : "Unknown session failure";
      current.completedAt = nowIso();
      await this.store.updateSession(current);
      await this.emit(current.sessionId, "SESSION_FAILED", "FAILED", current.failureReason, "critical");
    });

    return session;
  }

  async runSession(sessionId: string): Promise<void> {
    const session = await this.requireSession(sessionId);
    const project = await this.store.getProject(session.projectId);
    if (!project) throw new Error(`Project not found: ${session.projectId}`);

    session.status = "RUNNING";
    session.phase = "SANDBOX_PREPARE";
    session.startedAt = nowIso();
    await this.store.updateSession(session);
    await this.emit(sessionId, "SESSION_STARTED", "SANDBOX_PREPARE", "Analysis session started.", "info");

    const workspace = `${this.store.sessionPath(sessionId)}/workspace`;
    await mkdir(workspace, { recursive: true });
    await this.projectService.copyProjectToSession(project, workspace);
    await this.emit(sessionId, "WORKSPACE_READY", "SANDBOX_PREPARE", "Uploaded source copied into session workspace.", "success", {
      workspaceIsSessionScoped: true,
      hostExecutionAllowed: false
    });

    await this.emit(sessionId, "AGENTS_DEPLOYED", "AGENT_ORCHESTRATION", "Analysis agents loaded with locked system prompts.", "success", {
      agents: session.agentIds
    });

    await this.emit(sessionId, "SANDBOX_STARTING", "SANDBOX_EXECUTION", "Starting sandboxed command plan.", "info", {
      provider: this.sandboxProvider.providerName,
      network: "disabled"
    });

    const sandbox = await this.sandboxProvider.run({
      sessionId,
      workspacePath: workspace,
      commands: DEFAULT_COMMAND_PLAN,
      maxSessionSeconds: this.config.maxSessionSeconds
    });

    const allPassed = sandbox.results.length > 0 && sandbox.results.every((result) => result.exitCode === 0 && !result.timedOut);
    await this.emit(
      sessionId,
      allPassed ? "TEST_PASSED" : "TEST_FAILED",
      "SANDBOX_EXECUTION",
      allPassed ? "Sandbox command plan completed." : "Sandbox command plan failed.",
      allPassed ? "success" : "warning",
      { results: sandbox.results.map(({ id, exitCode, timedOut }) => ({ id, exitCode, timedOut })) }
    );

    const findings = buildFindings(session.agentIds, sandbox.results);
    const report: AnalysisReport = {
      sessionId,
      projectId: project.projectId,
      status: allPassed ? "COMPLETED" : "FAILED",
      executiveSummary: allPassed
        ? "Sandboxed analysis completed. No host execution was used."
        : "Sandboxed analysis completed with failing commands. Review stderr and test output artifacts.",
      sandbox: {
        provider: sandbox.provider,
        image: sandbox.image,
        network: "disabled",
        hostExecutionAllowed: false
      },
      commands: sandbox.results,
      findings,
      artifacts: ["session.json", "events.jsonl", "report.json", "workspace/"]
    };

    await this.store.writeReport(report);
    await this.emit(sessionId, "REPORT_READY", "REPORT", "Report artifact written.", "success");

    session.status = report.status;
    session.phase = report.status === "COMPLETED" ? "COMPLETED" : "FAILED";
    session.completedAt = nowIso();
    if (report.status === "FAILED") {
      session.failureReason = "One or more sandbox commands failed.";
    }
    await this.store.updateSession(session);
    await this.emit(
      sessionId,
      report.status === "COMPLETED" ? "SESSION_COMPLETED" : "SESSION_FAILED",
      session.phase,
      report.status === "COMPLETED" ? "Session completed." : session.failureReason ?? "Session failed.",
      report.status === "COMPLETED" ? "success" : "critical"
    );
  }

  private async requireSession(sessionId: string): Promise<Session> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error(`Unknown sessionId: ${sessionId}`);
    return session;
  }

  private async emit(
    sessionId: string,
    eventType: string,
    phase: string,
    message: string,
    severity: SessionEvent["severity"],
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.store.appendEvent({
      eventId: makeId("event"),
      sessionId,
      eventType,
      phase,
      timestamp: nowIso(),
      message,
      severity,
      data
    });
  }
}

function buildFindings(agentIds: AgentId[], results: AnalysisReport["commands"]): AgentFinding[] {
  const failed = results.filter((result) => result.exitCode !== 0 || result.timedOut);
  const findings: AgentFinding[] = [];

  if (failed.length > 0) {
    findings.push({
      findingId: makeId("finding"),
      title: "Sandbox verification failed",
      severity: "medium",
      confidence: 0.9,
      evidence: failed.map((result) => `${result.id} exited with ${result.exitCode}`).join("; "),
      recommendation: "Inspect sandbox stderr/stdout, fix the project tests or dependency lockfile, and rerun analysis.",
      source: agentIds.includes("security-review-agent") ? "security-review-agent" : "report-agent"
    });
  }

  return findings;
}
