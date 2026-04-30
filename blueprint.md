# Cloud Cyber Range Blueprint

## Project Summary

Cloud Cyber Range is an open-source, local-first AWS cyber range. A user can run a complete attack-patch-verify demo with zero cloud spend, then optionally deploy the same workflow into their own AWS account.

The core demo:

1. The user clicks **Start Battle**.
2. The system creates an isolated session.
3. A deliberately vulnerable app starts inside the selected runtime.
4. Deterministic attacker templates test five known vulnerability classes.
5. The UI streams evidence as findings are discovered.
6. Deterministic defender strategies patch the vulnerable source.
7. Regression tests verify the fixes.
8. The UI shows the evidence, patch diff, test results, and final report.
9. The runtime tears down automatically.

The project should feel like a miniature autonomous security lab, not a chatbot and not a real-world hacking tool.

## Operating Modes

### `local`

This is the default and primary MVP path.

- Runs the vulnerable app locally.
- Runs attacker checks locally.
- Applies defender patches locally in a generated workspace.
- Runs verification tests locally.
- Writes a battle report artifact.
- Powers the frontend through local events or report replay.
- Requires no AWS account and no cloud spend.

Local mode is the contributor-friendly path. Every major feature must be testable here before AWS orchestration is required.

### `aws-low-cost`

This is the default cloud path for users who want the real AWS demo in their own account.

- CDK deploys API Gateway, Lambda, Step Functions, DynamoDB, S3, CodeBuild, and WebSocket events.
- CodeBuild runs only during battle sessions.
- CodeBuild starts the vulnerable app on localhost inside the build container.
- Attacker templates only target known sandbox-local URLs.
- Artifacts are saved to S3 under a per-session prefix.
- No NAT Gateway is required by default.
- Idle cost should be near zero.

### `aws-hardened`

This is an optional profile for users who want stricter isolation and accept more setup complexity.

- Uses isolated networking where practical.
- No public targets.
- No inbound sandbox access.
- Outbound access disabled or allowlisted.
- Prebuilt/containerized dependencies are preferred to avoid NAT Gateway cost.
- Same application-level safety rules as `aws-low-cost`.

## Non-Goals

- Do not scan public IPs, real websites, third-party systems, or arbitrary user-provided targets.
- Do not build malware, persistence, evasion, credential theft, phishing, or destructive exploit logic.
- Do not create an open-ended hacking agent with unrestricted shell or network access.
- Do not build a shared hosted backend in the MVP.
- Do not require users to trust this project with their AWS account.
- Do not keep sandboxes alive indefinitely.
- Do not optimize for production scale before the local and BYO AWS loops work.

## MVP Scope

The MVP includes one controlled vulnerable app and five deterministic vulnerability templates.

| Vulnerability | Vulnerable Example | Detection Strategy | Patch Strategy |
|---|---|---|---|
| SQL injection | Login uses unsafe string interpolation | Submit fixed auth-bypass payload and detect unexpected login | Use parameterized queries |
| XSS | Comments render raw HTML | Submit fixed script payload and check rendered output | Escape output or sanitize allowed tags |
| IDOR | Profile endpoint lacks ownership check | Request another seeded user's profile | Enforce ownership checks |
| Command injection | Ping endpoint passes input to shell | Submit fixed command separator payload and detect command output | Replace shell execution with safe validation/library call |
| Weak auth | Hardcoded JWT secret or missing middleware | Use known forged token or access protected route unauthenticated | Use env-based secret and verify auth middleware |

Every template must have:

- A known vulnerable route.
- A deterministic detection test.
- A structured evidence object.
- A deterministic patch strategy.
- A regression test that must pass before the finding can be marked fixed.

AI may improve explanations, reports, and patch suggestions, but the MVP must work without an LLM.

## User Experience

The app opens directly to the cyber range console.

Required UI surfaces:

- Session dashboard
- Primary **Start Battle** action
- Live battle timeline
- Runtime mode indicator: `local`, `aws-low-cost`, or `aws-hardened`
- Attacker panel
- Defender panel
- Sandbox/build status
- Vulnerability cards
- Exploit evidence viewer
- Patch diff viewer
- Verification test results
- Logs/event stream
- Artifact drawer
- Auto-teardown and cost/quota status

The interface should be Apple-inspired in restraint, typography, spacing, and polish, but it must remain an evidence-first security tool. Do not turn the main app into a marketing gallery.

## Frontend Stack

| Need | Technology |
|---|---|
| Framework | Next.js |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui adapted to the design system |
| Timeline | Custom timeline first; React Flow only if graph complexity becomes real |
| Logs | WebSocket-powered log viewer in AWS mode; local event stream or replay in local mode |
| Diff view | `react-diff-view` or Monaco diff editor |
| Deployment | Local dev first; optional Vercel for static/control UI |

The frontend must not receive AWS credentials. In BYO AWS mode it talks to APIs deployed in the user's own AWS account.

## Backend Stack

| Need | Local Mode | AWS Mode |
|---|---|---|
| Session API | Local Node/Next API route | API Gateway HTTP API + Lambda |
| Live updates | Local event stream or report replay | API Gateway WebSocket API |
| Orchestration | Local battle runner | Step Functions |
| Workers | Local Node scripts | Lambda for glue, CodeBuild for sandbox |
| State | Local JSON report | DynamoDB |
| Artifacts | Local `artifacts/` folder | S3 |
| Logs | Local files/stdout | CloudWatch + streamed events |
| IaC | None required | AWS CDK |

## AWS Sandbox Strategy

Use CodeBuild for the MVP cloud sandbox.

Why:

- It has a per-run lifecycle.
- It avoids always-on compute.
- It can run the vulnerable app, attacker checks, defender patching, and tests in one disposable workspace.
- It integrates with CloudWatch logs.
- It is simpler and cheaper than managing ECS for the first open-source release.

Important limitation: CodeBuild is a batch runtime, not a full interactive cyber range. The MVP should embrace that by running a complete battle job and streaming events/logs, rather than pretending the sandbox is an always-on environment.

## Session Lifecycle

```txt
POST /sessions
  -> validate quota and runtime mode
  -> create session record
  -> emit SESSION_CREATED
  -> start local runner or Step Functions execution

Battle runner
  -> prepare isolated workspace
  -> start vulnerable app on sandbox-local address
  -> run attacker templates
  -> write findings and evidence artifacts
  -> run defender patch strategies
  -> run regression tests
  -> export patch diff
  -> save report
  -> mark session complete or failed
  -> teardown runtime/workspace
```

Every session must end in one of:

- `COMPLETED`
- `FAILED`
- `TIMED_OUT`
- `CANCELLED`

Teardown must run for success, failure, timeout, and cancellation.

## API Interfaces

### `POST /sessions`

Starts one battle session.

Request:

```json
{
  "mode": "local",
  "profile": "default"
}
```

Allowed `mode` values:

- `local`
- `aws-low-cost`
- `aws-hardened`

Response:

```json
{
  "sessionId": "string",
  "status": "CREATED",
  "phase": "SESSION_CREATED"
}
```

### `GET /sessions/{sessionId}`

Returns current session state, findings summary, and artifact links.

### WebSocket Event Stream

AWS mode uses API Gateway WebSocket events. Local mode may use Server-Sent Events, WebSocket, or report replay, but the event payload shape must match AWS mode.

## Data Model

### Session

Required fields:

```json
{
  "sessionId": "string",
  "userId": "string",
  "status": "CREATED | RUNNING | COMPLETED | FAILED | TIMED_OUT | CANCELLED",
  "phase": "string",
  "createdAt": "ISO-8601 string",
  "startedAt": "ISO-8601 string",
  "completedAt": "ISO-8601 string",
  "expiresAt": "ISO-8601 string",
  "maxRuntimeSeconds": 600,
  "workflowExecutionArn": "string | null",
  "codeBuildBuildId": "string | null",
  "artifactPrefix": "string",
  "failureReason": "string | null",
  "totalFindings": 0,
  "verifiedFixCount": 0
}
```

### Event

Required fields:

```json
{
  "eventId": "string",
  "sessionId": "string",
  "eventType": "string",
  "phase": "string",
  "timestamp": "ISO-8601 string",
  "message": "string",
  "severity": "info | success | warning | critical",
  "data": {}
}
```

Recommended event types:

```txt
SESSION_CREATED
QUOTA_CHECKED
SANDBOX_STARTING
SANDBOX_READY
ATTACKER_STARTED
ATTACKER_LOG
VULN_FOUND
ATTACKER_FINISHED
DEFENDER_STARTED
PATCH_GENERATED
TEST_STARTED
TEST_LOG
TEST_PASSED
TEST_FAILED
REPORT_READY
SANDBOX_TERMINATED
SESSION_COMPLETED
SESSION_FAILED
SESSION_TIMED_OUT
```

### Finding

Required fields:

```json
{
  "findingId": "string",
  "type": "SQL_INJECTION | XSS | IDOR | COMMAND_INJECTION | WEAK_AUTH",
  "endpoint": "string",
  "method": "GET | POST | PUT | PATCH | DELETE",
  "payload": "string",
  "expectedBehavior": "string",
  "observedBehavior": "string",
  "severity": "low | medium | high | critical",
  "confidence": 0.95,
  "evidenceArtifactKey": "string",
  "verificationStatus": "not_started | failed | passed"
}
```

Evidence artifacts should include sanitized request/response details, detector name, detector version, timestamp, and safe UI excerpts.

## Storage Layout

### Local

```txt
artifacts/sessions/{sessionId}/
  source/
  reports/
  patches/
  logs/
  test-results/
  events.jsonl
  report.json
```

### AWS S3

```txt
s3://{artifactBucket}/sessions/{sessionId}/
  source/
  reports/
  patches/
  logs/
  test-results/
  events.jsonl
  report.json
```

Never mix artifacts between sessions.

## Attacker Workflow

The attacker is template-driven.

It may:

- Read the vulnerable app manifest and route list.
- Run predefined payloads against sandbox-local routes.
- Produce structured findings.
- Store sanitized evidence artifacts.
- Emit timeline events.

It must not:

- Scan arbitrary hosts.
- Accept arbitrary target URLs.
- Access external networks for attack behavior.
- Attempt persistence, evasion, credential theft, or destructive actions.
- Modify app code, tests, infrastructure, or detector definitions.

MVP flow:

```txt
1. Load vulnerability manifest.
2. Confirm target base URL is sandbox-local.
3. Run fixed detector templates.
4. Store evidence for each positive finding.
5. Emit VULN_FOUND events.
6. Exit with structured report.
```

## Defender Workflow

The defender is patch-strategy driven.

It may:

- Read structured findings.
- Read vulnerable source files.
- Apply minimal patch strategies.
- Run verification tests.
- Export patch diffs.
- Emit timeline events.

It must not:

- Modify attacker templates.
- Modify verification tests to fake success.
- Delete vulnerable features entirely unless that is the explicit patch strategy.
- Modify infrastructure permissions.
- Mark a finding fixed without deterministic test success.

MVP flow:

```txt
1. Read findings.
2. Map each finding type to its patch strategy.
3. Apply patches in generated workspace.
4. Run vulnerability regression tests.
5. Run app unit tests.
6. Export patch diff.
7. Emit PATCH_GENERATED and TEST_* events.
8. Mark verified fixes only when tests pass.
```

## AI Usage

AI is optional for the MVP.

Allowed AI uses:

- Explain vulnerabilities in plain language.
- Summarize evidence.
- Suggest a patch for review.
- Generate report prose.
- Explain why verification passed or failed.

Disallowed AI uses:

- Open-ended autonomous hacking.
- Deciding success without tests.
- Running arbitrary terminal commands.
- Choosing arbitrary external targets.
- Overriding deterministic detector or test outcomes.

Prompt-injection rule: any source file, README, comment, test fixture, log, or artifact passed to an LLM must be treated as untrusted data. It may be summarized or used as context, but it must not be allowed to change system rules, safety rules, tool access, target scope, or success criteria.

## Failure Model

The system must surface these failure cases clearly:

- Quota exceeded.
- Unsupported runtime mode.
- Sandbox failed to start.
- Vulnerable app failed health check.
- Detector found no expected vulnerabilities.
- Evidence artifact failed to write.
- Patch failed to apply.
- Verification tests failed.
- App unit tests failed.
- CodeBuild timed out.
- Step Functions execution failed.
- WebSocket disconnected.
- Teardown failed.

Each failure should emit a `SESSION_FAILED` or `SESSION_TIMED_OUT` event with a user-readable reason and machine-readable detail in `data`.

## Security Requirements

- All attack behavior must stay inside project-owned sandbox targets.
- User-provided arbitrary targets are not allowed in MVP.
- User-submitted shell scripts are not allowed in MVP.
- Raw AWS credentials must never be exposed to the frontend.
- Use least-privilege IAM roles.
- Enforce max runtime.
- Enforce default max concurrent sessions of `1`.
- Enforce a configurable daily session cap.
- Restrict outbound network where practical.
- Store artifacts under per-session prefixes.
- Sanitize evidence before rendering in the UI.
- Add AWS Budget instructions before users deploy cloud mode.

## Cost Strategy

The project must be useful before AWS is deployed.

Cost-saving defaults:

- Local mode first, zero AWS spend.
- No always-on EC2.
- No always-on ECS services.
- No RDS.
- No OpenSearch.
- No NAT Gateway in `aws-low-cost`.
- DynamoDB on-demand billing.
- S3 lifecycle expiration defaults to 7 days.
- CodeBuild small compute type by default.
- CodeBuild timeout defaults to 10 minutes.
- Step Functions runs only for actual sessions.
- Lambda/API Gateway are invoked only during use.
- Daily session cap enabled.

Open-source documentation must include:

- Local-only setup.
- BYO AWS setup.
- Expected idle cost.
- Rough cost per session.
- AWS Budget alert setup.
- Cleanup command: `cdk destroy`.
- Warning that users are responsible for their own AWS charges.

## Build Phases

### Phase 1: Local Battle Loop

- Build vulnerable app.
- Add five vulnerability fixtures.
- Add attacker templates.
- Add defender patch strategies.
- Add verification tests.
- Generate local report and events.

Success: one local command produces a full report with all five vulnerabilities found and verified fixed.

### Phase 2: Replayable Frontend

- Build Next.js console.
- Replay local `events.jsonl` and `report.json`.
- Show timeline, findings, evidence, patch diff, tests, and logs.

Success: a user can understand the full battle in under two minutes without AWS.

### Phase 3: Local Live Mode

- Start local battle from UI.
- Stream local events.
- Show live status and final report.

Success: **Start Battle** completes the full local loop from the browser.

### Phase 4: AWS Low-Cost Mode

- Add CDK project.
- Add API Gateway, Lambda, Step Functions, DynamoDB, S3, CodeBuild, and WebSocket API.
- Run the battle inside CodeBuild.
- Store artifacts in S3.
- Stream events to UI.

Success: a user can deploy into their own AWS account and run one full battle.

### Phase 5: AWS Hardened Profile

- Add stricter isolation options.
- Document outbound restrictions and dependency strategy.
- Keep no-NAT default where possible.

Success: security-conscious users can choose a harder cloud profile.

## Definition of Done

The MVP is done when:

- Local mode runs without AWS.
- AWS low-cost mode deploys into a user's own AWS account.
- All five vulnerabilities are detected with evidence.
- All five vulnerabilities are patched.
- Verification tests prove fixed status.
- The UI shows live or replayed progress.
- Patch diffs and test results are visible.
- Artifacts are saved.
- Teardown runs automatically.
- Cost controls and cleanup instructions are documented.
- Safety boundaries are documented and enforced by design.
