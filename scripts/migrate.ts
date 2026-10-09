import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });
config();

async function main() {
  // On Vercel, only migrate real deployments (production/preview), and never a build without a database.
  if (process.env.VERCEL && !["production", "preview"].includes(process.env.VERCEL_ENV ?? "")) {
    console.log(`skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV})`);
    return;
  }
  // Migrations need a direct connection; the pooled URL is for the running app.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    if (process.env.VERCEL) throw new Error("DATABASE_URL is not set for this Vercel environment");
    throw new Error("DATABASE_URL is not set");
  }
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();
  console.log("migrations applied");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
