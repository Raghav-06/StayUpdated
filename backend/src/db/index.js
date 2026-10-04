import { readFile } from "node:fs/promises";
import pg from "pg";
import { httpError } from "../utils/httpError.js";

let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw httpError(500, "DATABASE_URL is not set");
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    });
  }
  return pool;
}

const CONNECTION_ERRORS = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "57P03"]);

export async function query(text, params) {
  try {
    return await getPool().query(text, params);
  } catch (err) {
    if (CONNECTION_ERRORS.has(err.code)) {
      console.error(`Database unreachable (${err.code}): is PostgreSQL running at DATABASE_URL?`);
      throw httpError(503, "The database is not reachable right now. Please try again shortly.");
    }
    throw err;
  }
}

export async function migrate() {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await getPool().query(sql);
}
