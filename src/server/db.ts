import pg, { type PoolClient, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;
export const databaseConfigured = Boolean(connectionString);
export const pool = connectionString ? new pg.Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false,
  max: 10,
}) : null;

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  if (!pool) throw new Error("DATABASE_NOT_CONFIGURED");
  return pool.query<T>(text, values);
}

export async function transaction<T>(userId: string | null, sessionId: string | null, requestId: string, fn: (client: PoolClient) => Promise<T>) {
  if (!pool) throw new Error("DATABASE_NOT_CONFIGURED");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT app.set_request_context($1,$2,$3)", [userId, sessionId, requestId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
