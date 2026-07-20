import "server-only";
import { createClient, type Client } from "@libsql/client";

/** Turso client singleton (survives Next dev hot-reload via globalThis). */
const g = globalThis as unknown as { __lotrDb?: Client };

export function db(): Client {
  if (!g.__lotrDb) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) throw new Error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set");
    g.__lotrDb = createClient({ url, authToken });
  }
  return g.__lotrDb;
}
