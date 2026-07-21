import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` runs during the image build, before Compose supplies
    // the runtime database URL. Commands that connect to PostgreSQL still
    // receive DATABASE_URL from the environment.
    url: process.env.DATABASE_URL ?? "",
  },
});
