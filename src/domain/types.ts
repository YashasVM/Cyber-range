export type Severity = "info" | "success" | "warning" | "critical";

export type SessionStatus = "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "TIMED_OUT" | "CANCELLED";

export type AgentId =
  | "intake-agent"
  | "test-planner-agent"
  | "sandbox-runner-agent"
  | "security-review-agent"
  | "report-agent";

export type UploadedFile = {
  path: string;
  contentBase64: string;
};

export type Project = {
  projectId: string;
  name: string;
  company?: string;
  createdAt: string;
  rootPath: string;
  fileCount: number;
  sizeBytes: number;
};

export type Session = {
  sessionId: string;
  projectId: string;
  requestedBy: string;
  profile: "standard" | "deep";
  status: SessionStatus;
  phase: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  expiresAt: string;
  artifactPrefix: string;
  failureReason?: string;
  agentIds: AgentId[];
};

export type SessionEvent = {
  eventId: string;
  sessionId: string;
  eventType: string;
  phase: string;
  timestamp: string;
  message: string;
  severity: Severity;
  data?: Record<string, unknown>;
};

export type AgentFinding = {
  findingId: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  evidence: string;
  recommendation: string;
  source: AgentId;
};

export type AnalysisReport = {
  sessionId: string;
  projectId: string;
  status: SessionStatus;
  executiveSummary: string;
  sandbox: {
    provider: string;
    image?: string;
    network: "disabled";
    hostExecutionAllowed: false;
  };
  commands: SandboxCommandResult[];
  findings: AgentFinding[];
  artifacts: string[];
};

export type SandboxCommand = {
  id: string;
  command: string[];
  timeoutSeconds: number;
};

export type SandboxCommandResult = {
  id: string;
  command: string[];
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};
