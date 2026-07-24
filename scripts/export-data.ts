import { link, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { exportAllData } from "../src/lib/data-portability";
import { prisma } from "../src/lib/prisma";

async function main() {
  const data = await exportAllData();
  const requested = process.argv[2];
  const filename =
    requested ??
    `backups/flexitime-export-${data.exportedAt.replaceAll(":", "-")}.json`;
  const target = path.resolve(filename);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.partial-${process.pid}`;
  try {
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await link(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  console.log(`Exported all application data to ${target}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
