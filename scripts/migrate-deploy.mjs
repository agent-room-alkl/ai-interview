/**
 * Run `prisma migrate deploy` during Vercel build without hanging forever
 * when DATABASE_URL points at PgBouncer transaction pooling.
 */
import { spawn } from "node:child_process";

const TIMEOUT_MS = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 60_000);

const child = spawn("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

const timer = setTimeout(() => {
  console.error(
    `[migrate-deploy] timed out after ${TIMEOUT_MS}ms — continuing build. ` +
      "Apply pending migrations with a direct (non-pooled) DATABASE_URL if schema is behind.",
  );
  child.kill("SIGTERM");
  // Don't fail the build; app may already have schema from manual SQL.
  process.exit(0);
}, TIMEOUT_MS);

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (signal) {
    console.error(`[migrate-deploy] exited from signal ${signal}`);
    process.exit(0);
    return;
  }
  if (code === 0) {
    process.exit(0);
    return;
  }
  console.error(
    `[migrate-deploy] prisma migrate deploy exited ${code}. Continuing build; ` +
      "fix DB schema if runtime Prisma errors mention missing columns/tables.",
  );
  process.exit(0);
});
