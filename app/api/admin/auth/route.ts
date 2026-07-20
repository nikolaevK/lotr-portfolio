import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  EMAIL_MAX_FAILURES, IP_MAX_FAILURES,
  clientIp, createSession, destroySession, dummyVerify, getSession,
  hashPassword, passwordProblem, recordAttempt, sameOrigin, tooManyAttempts,
  verifyPassword,
} from "@/server/auth";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function adminCount(): Promise<number> {
  const res = await db().execute("SELECT count(*) AS n FROM admin_users");
  return Number(res.rows[0].n);
}

/** Session + first-run status for the admin UI. */
export async function GET() {
  const [session, count] = await Promise.all([getSession(), adminCount()]);
  return NextResponse.json({
    authenticated: !!session,
    email: session?.email ?? null,
    needsSetup: count === 0,
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  let body: { action?: string; email?: string; password?: string; setupToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;

  if (action === "logout") {
    await destroySession();
    return NextResponse.json({ ok: true });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (action === "setup") {
    // First-run only, and only for whoever holds the deploy-time setup token —
    // an open fresh deploy must not be claimable by a stranger.
    const expected = process.env.ADMIN_SETUP_TOKEN;
    if (!expected) {
      return NextResponse.json(
        { error: "ADMIN_SETUP_TOKEN is not configured on the server." },
        { status: 503 },
      );
    }
    const given = body.setupToken ?? "";
    const a = Buffer.from(given), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Invalid setup token." }, { status: 403 });
    }
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    // atomic first-admin claim: the WHERE NOT EXISTS makes concurrent setups race-safe
    const res = await db().execute({
      sql: `INSERT INTO admin_users (email, password_hash)
            SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM admin_users)
            RETURNING id`,
      args: [email, await hashPassword(password)],
    });
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Admin already configured. Sign in instead." }, { status: 409 });
    }
    await createSession(Number(res.rows[0].id));
    return NextResponse.json({ ok: true, email });
  }

  if (action === "login") {
    const keys = [`email:${email}`, `ip:${clientIp(req)}`];
    const limits = [
      { key: keys[0], max: EMAIL_MAX_FAILURES },
      { key: keys[1], max: IP_MAX_FAILURES },
    ];
    if (await tooManyAttempts(limits)) {
      return NextResponse.json(
        { error: "Too many failed attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }
    const res = await db().execute({
      sql: "SELECT id, password_hash FROM admin_users WHERE email = ?",
      args: [email],
    });
    const row = res.rows[0];
    // same work + same error whether the account exists or not
    const ok = row ? await verifyPassword(password, String(row.password_hash)) : (await dummyVerify(), false);
    await recordAttempt(keys, ok);
    if (!ok) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    await createSession(Number(row!.id));
    return NextResponse.json({ ok: true, email });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
