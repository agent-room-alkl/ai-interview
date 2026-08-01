/**
 * Run `prisma migrate deploy` during Vercel build without hanging forever
 * when DATABASE_URL points at PgBouncer transaction pooling.
 */
import { spawn } from "node:child_process";

const TIMEOUT_MS = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 60_000);

// Prisma migrations need a session connection for advisory locks. Vercel's
// DATABASE_URL may point at Supabase/PgBouncer, while the platform also
// exposes POSTGRES_URL_NON_POOLING for schema changes.
const migrationEnv = { ...process.env };
const directUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.DIRECT_URL || "";
if (directUrl) migrationEnv.DATABASE_URL = directUrl;

const child = spawn("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: migrationEnv,
  shell: process.platform === "win32",
});

const timer = setTimeout(() => {
  console.error(
    `[migrate-deploy] timed out after ${TIMEOUT_MS}ms — failing build. ` +
      "Apply pending migrations with a direct (non-pooled) DATABASE_URL, then redeploy.",
  );
  child.kill("SIGTERM");
  process.exit(1);
}, TIMEOUT_MS);

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (signal) {
    console.error(`[migrate-deploy] exited from signal ${signal}`);
    process.exit(1);
    return;
  }
  if (code === 0) {
    process.exit(0);
    return;
  }
  console.error(
    `[migrate-deploy] prisma migrate deploy exited ${code}. Failing build; ` +
      "fix the database schema and redeploy.",
  );
  process.exit(1);
});
