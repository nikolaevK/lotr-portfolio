import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { clientIp, sameOrigin } from "@/server/auth";

export const runtime = "nodejs";

// public endpoint — per-IP cap for ordinary spam, global cap so IP rotation
// (an IPv6 /64 is a bottomless bucket supply) still can't fill the inbox
const MAX_PER_IP_HOUR = 5;
const MAX_GLOBAL_HOUR = 30;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(payload.name);
  const email = str(payload.email);
  const message = str(payload.message);
  if (!name || name.length > 200) return NextResponse.json({ error: "Give the raven your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return NextResponse.json({ error: "That email looks unreadable to a raven." }, { status: 400 });
  }
  if (!message || message.length > 5000) return NextResponse.json({ error: "The message must fit the scroll (1–5000 characters)." }, { status: 400 });

  // clientIp trusts the first x-forwarded-for hop — valid on Vercel (which
  // rewrites inbound XFF), spoofable behind other proxies; hence the global cap
  const ip = clientIp(req);
  const recent = await db().execute({
    sql: "SELECT COUNT(*) AS total, SUM(ip = ?) AS mine FROM contact_messages WHERE created_at > datetime('now', '-1 hour')",
    args: [ip],
  });
  const row = recent.rows[0];
  if (Number(row?.mine ?? 0) >= MAX_PER_IP_HOUR || Number(row?.total ?? 0) >= MAX_GLOBAL_HOUR) {
    return NextResponse.json({ error: "The rookery is resting — try again in an hour." }, { status: 429 });
  }

  await db().batch(
    [
      {
        sql: "INSERT INTO contact_messages (from_name, from_email, message, ip) VALUES (?,?,?,?)",
        args: [name, email, message, ip],
      },
      // opportunistic retention: year-old ravens (and their IPs) have no reaper
      { sql: "DELETE FROM contact_messages WHERE created_at < datetime('now', '-365 days')", args: [] },
    ],
    "write",
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}
