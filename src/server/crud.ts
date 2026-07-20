import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getSession, sameOrigin } from "@/server/auth";
import { ENTITIES, type EntityDef, type FieldDef } from "@/admin/entities";

/** Guard shared by every /api/admin/data handler. Returns a response to short-circuit with, or null. */
export async function guard(req: Request): Promise<NextResponse | null> {
  if (req.method !== "GET" && !sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  if (!(await getSession())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return null;
}

export function entityOr404(name: string): EntityDef | null {
  return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : null;
}

/** Coerce+validate one value by field type; returns [ok, value]. */
function coerce(f: FieldDef, raw: unknown): [boolean, string | number | null] {
  if (raw === undefined || raw === null || raw === "") {
    return f.required ? [false, null] : [true, f.type === "bool" ? 0 : null];
  }
  switch (f.type) {
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? [true, n] : [false, null];
    }
    case "bool":
      return [true, raw === true || raw === 1 || raw === "1" || raw === "true" ? 1 : 0];
    default: {
      const s = String(raw);
      return s.length <= 20000 ? [true, s] : [false, null];
    }
  }
}

/** Validate a payload against the entity's field whitelist. partial = updates. */
export function buildValues(
  def: EntityDef,
  payload: Record<string, unknown>,
  partial: boolean,
): { cols: string[]; vals: (string | number | null)[] } | { error: string } {
  const cols: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const f of def.fields) {
    const present = Object.prototype.hasOwnProperty.call(payload, f.name);
    if (!present && partial) continue;
    const raw = payload[f.name];
    const empty = raw === undefined || raw === null || raw === "";
    // creates omit empty optional columns so DB defaults (sort_order 0, scale 1…) apply
    if (empty && !f.required && !partial) continue;
    const [ok, v] = coerce(f, raw);
    if (!ok) return { error: `Invalid or missing value for "${f.name}"` };
    cols.push(f.name);
    vals.push(v);
  }
  if (cols.length === 0) return { error: "Nothing to save" };
  return { cols, vals };
}

export const dbc = db;
