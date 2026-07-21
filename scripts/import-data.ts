import { readFile } from "node:fs/promises";
import path from "node:path";
import { importAllData } from "../src/lib/data-portability";
import { prisma } from "../src/lib/prisma";

async function main() {
  const filename = process.argv[2];
  const confirmation = process.argv[3];
  if (!filename || confirmation !== "--confirm-replace") {
    throw new Error(
      "Usage: npm run data:import -- <export.json> --confirm-replace",
    );
  }
  const source = path.resolve(filename);
  const payload: unknown = JSON.parse(await readFile(source, "utf8"));
  await importAllData(payload);
  console.log(`Replaced application data from ${source}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
