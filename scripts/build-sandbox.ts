import { checkDockerAvailability } from "../src/sandbox/docker-availability";

const image = process.env.SANDBOX_IMAGE ?? "bun-sandbox:latest";
const docker = await checkDockerAvailability();

if (!docker.available) {
  dockerUnavailable();
}

const build = Bun.spawn(["docker", "build", "-t", image, "sandbox"], {
  stdout: "inherit",
  stderr: "inherit"
});

const buildExitCode = await build.exited;
process.exit(buildExitCode);

function dockerUnavailable(): never {
  console.error(
    [
      "Docker is required for real sandbox execution, but the sandbox is not ready.",
      "",
      docker.version ? `Docker CLI found: ${docker.version}` : "Install Docker Desktop for Windows.",
      docker.reason ?? "Docker daemon is not reachable.",
      "Start Docker Desktop, wait until it says Docker is running, and retry.",
      "Cloud Cyber Range will not run uploaded code on the host as a fallback."
    ].join("\n")
  );
  process.exit(1);
}
