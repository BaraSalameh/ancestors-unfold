import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
});
await client.connect();
try {
  await client.query(await readFile("db/tests/001_schema_smoke.sql", "utf8"));
  console.log("Database smoke test passed (transaction rolled back)");
} finally {
  await client.end();
}
