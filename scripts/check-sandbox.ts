import { checkDockerAvailability } from "../src/sandbox/docker-availability";

const docker = await checkDockerAvailability();

if (!docker.available) {
  console.error(
    [
      "Sandbox unavailable.",
      docker.version ? `Docker CLI found: ${docker.version}` : "Docker CLI was not found on PATH.",
      docker.reason ?? "Docker daemon is not reachable.",
      "",
      "Start Docker Desktop, wait until it says Docker is running, then retry `bun run sandbox:check`."
    ].join("\n")
  );
  process.exit(1);
}

console.log(`Sandbox prerequisite found: ${docker.version}`);
console.log("Docker daemon reachable.");
