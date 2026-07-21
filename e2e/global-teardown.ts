import { execFileSync } from "node:child_process";

export default function globalTeardown() {
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      "flexitime-e2e",
      "-f",
      "docker-compose.test.yml",
      "down",
      "--volumes",
    ],
    { stdio: "inherit" },
  );
}
