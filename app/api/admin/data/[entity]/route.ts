import { NextResponse } from "next/server";
import { buildValues, dbc, entityOr404, guard } from "@/server/crud";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const def = entityOr404((await ctx.params).entity);
  if (!def) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const res = await dbc().execute(`SELECT * FROM ${def.table} ORDER BY ${def.orderBy}`);
  return NextResponse.json({ rows: res.rows });
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const def = entityOr404((await ctx.params).entity);
  if (!def) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const built = buildValues(def, payload, false);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  let { cols, vals } = built;

  // settings-style tables supply their own key
  if (def.manualPk) {
    const pk = payload[def.pk];
    if (pk === undefined || pk === null || pk === "") {
      return NextResponse.json({ error: `"${def.pk}" is required` }, { status: 400 });
    }
    cols = [def.pk, ...cols];
    vals = [typeof pk === "number" ? pk : String(pk), ...vals];
  }

  try {
    const res = await dbc().execute({
      sql: `INSERT INTO ${def.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) RETURNING *`,
      args: vals,
    });
    return NextResponse.json({ row: res.rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: dbError(e) }, { status: 400 });
  }
}

function dbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^.*SQLITE_[A-Z_]+:?\s*/, "Database rejected the change: ");
}
