import "server-only";
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "@/server/db";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const SESSION_COOKIE = "admin_session";
const SESSION_DAYS = 7;
// Per-IP is the primary brute-force limit; the per-email cap is a high backstop
// against distributed guessing — high so a stranger spamming wrong passwords
// can't cheaply lock the real owner out (successful login resets both).
export const IP_MAX_FAILURES = 5;
export const EMAIL_MAX_FAILURES = 20;
const WINDOW_MIN = 15;

/** SQLite-comparable UTC timestamp ('YYYY-MM-DD HH:MM:SS') — same format as datetime('now'). */
const sqliteDate = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

// ── password hashing (scrypt, params embedded for future upgrades) ───────────
const N = 32768, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 });
  return `scrypt:${N}:${R}:${P}:${salt.toString("base64")}:${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: +n, r: +r, p: +p, maxmem: 256 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Burn comparable CPU when the email doesn't exist — no user enumeration via timing. */
export async function dummyVerify(): Promise<void> {
  await scrypt("dummy-password", Buffer.alloc(16), KEYLEN, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 });
}

export function passwordProblem(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 200) return "Password too long.";
  if (/^(.)\1*$/.test(pw)) return "Password must not be a single repeated character.";
  return null;
}

// ── sessions (random token in cookie; only its SHA-256 stored) ───────────────
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db().batch(
    [
      {
        sql: "INSERT INTO admin_sessions (user_id, token_hash, expires_at) VALUES (?,?,?)",
        args: [userId, sha256(token), sqliteDate(expires)],
      },
      // opportunistic cleanup: expired rows have no other reaper
      { sql: "DELETE FROM admin_sessions WHERE expires_at <= datetime('now')", args: [] },
    ],
    "write",
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export interface AdminSession {
  userId: number;
  email: string;
}

export async function getSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await db().execute({
    sql: `SELECT s.user_id AS userId, u.email
          FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    args: [sha256(token)],
  });
  const row = res.rows[0];
  return row ? { userId: Number(row.userId), email: String(row.email) } : null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db().execute({
      sql: "DELETE FROM admin_sessions WHERE token_hash = ?",
      args: [sha256(token)],
    });
  }
  store.delete(SESSION_COOKIE);
}

// ── login rate limiting (DB-backed; per-IP primary, per-email backstop) ──────
export async function tooManyAttempts(limits: { key: string; max: number }[]): Promise<boolean> {
  const results = await db().batch(
    limits.map(({ key }) => ({
      sql: `SELECT count(*) AS n FROM login_attempts
            WHERE key = ? AND success = 0 AND attempted_at > datetime('now', ?)`,
      args: [key, `-${WINDOW_MIN} minutes`],
    })),
    "read",
  );
  return limits.some(({ max }, i) => Number(results[i].rows[0].n) >= max);
}

export async function recordAttempt(keys: string[], success: boolean): Promise<void> {
  const stmts = success
    ? // successful login clears the slate — the owner is never locked out by stale failures
      keys.map((key) => ({ sql: "DELETE FROM login_attempts WHERE key = ?", args: [key as string | number] }))
    : keys.map((key) => ({
        sql: "INSERT INTO login_attempts (key, success) VALUES (?,0)",
        args: [key as string | number],
      }));
  // opportunistic cleanup so the table can't grow unbounded
  stmts.push({ sql: "DELETE FROM login_attempts WHERE attempted_at < datetime('now','-1 day')", args: [] });
  await db().batch(stmts, "write");
}

// ── CSRF: mutating requests must come from our own origin ────────────────────
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client (curl) — cookie auth still required
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
