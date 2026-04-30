import type { SandboxCommand } from "../domain/types";

const ALLOWED_EXECUTABLES = new Set(["bun", "npm", "node"]);
const BLOCKED_ARGS = [
  "--privileged",
  "--network",
  "--mount",
  "-v",
  "--volume",
  "--env-file",
  "--add-host",
  "--cap-add",
  "--pid",
  "--ipc",
  "--uts",
  "--userns",
  "/var/run/docker.sock"
];

export function assertAllowedSandboxCommand(command: SandboxCommand): void {
  if (!Array.isArray(command.command) || command.command.length === 0) {
    throw new Error(`Sandbox command ${command.id} is empty`);
  }

  const executable = command.command[0];
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    throw new Error(`Executable is not allowed in sandbox plan: ${executable}`);
  }

  for (const arg of command.command) {
    if (BLOCKED_ARGS.some((blocked) => arg.includes(blocked))) {
      throw new Error(`Blocked sandbox argument in ${command.id}: ${arg}`);
    }
  }

  if (!Number.isFinite(command.timeoutSeconds) || command.timeoutSeconds < 1 || command.timeoutSeconds > 600) {
    throw new Error(`Invalid timeout for sandbox command ${command.id}`);
  }
}
