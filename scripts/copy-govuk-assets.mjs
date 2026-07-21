import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  projectRoot,
  "node_modules/govuk-frontend/dist/govuk/assets",
);
const destination = resolve(projectRoot, "public/assets");

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, force: true });
