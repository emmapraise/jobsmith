import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export default async function setup() {
  const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/jobsmith_test", { max: 1, onnotice: () => undefined });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();
}
