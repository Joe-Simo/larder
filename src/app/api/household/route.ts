import { snapshot } from "@/lib/household";
import { loadHousehold, normalizeHousehold, resetHousehold } from "@/lib/store";

/** Read-only view of a household's kitchen for the simulator's side panel, and a reset for the demo. */
export async function GET(req: Request) {
  const id = normalizeHousehold(new URL(req.url).searchParams.get("household"));
  return Response.json(snapshot(await loadHousehold(id)), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { household?: string; action?: string };
  if (body.action !== "reset") return Response.json({ error: "unknown action" }, { status: 400 });
  return Response.json(snapshot(await resetHousehold(normalizeHousehold(body.household))));
}
