import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
});
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
)`);
for (const filename of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  const done = await client.query("SELECT 1 FROM public.schema_migrations WHERE filename=$1", [
    filename,
  ]);
  if (done.rowCount) continue;
  const sql = await readFile(`db/migrations/${filename}`, "utf8");
  await client.query(sql);
  await client.query("INSERT INTO public.schema_migrations(filename) VALUES($1)", [filename]);
  console.log(`Applied ${filename}`);
}
await client.end();
