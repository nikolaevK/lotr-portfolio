// Idempotent schema migration: applies db/schema.sql (all IF NOT EXISTS) and
// the ALTERs that CREATE TABLE IF NOT EXISTS cannot express on existing tables.
// Safe to run repeatedly: node --env-file=.env.local scripts/migrate.mjs
import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set (use --env-file=.env.local)");
  process.exit(1);
}
const db = createClient({ url, authToken });

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await db.executeMultiple(schema);

// column additions for DBs created before the column existed
const ADD_COLUMNS = {
  resume_variants: [
    ["file_name", "TEXT"],
    ["data", "BLOB"],
    ["uploaded_at", "TEXT"],
  ],
};
for (const [table, cols] of Object.entries(ADD_COLUMNS)) {
  const have = (await db.execute(`SELECT name FROM pragma_table_info('${table}')`)).rows.map((r) => r.name);
  for (const [name, type] of cols) {
    if (!have.includes(name)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
      console.log(`added ${table}.${name}`);
    }
  }
}
console.log("migration complete");
