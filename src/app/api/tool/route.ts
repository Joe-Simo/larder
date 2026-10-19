import { z } from "zod";
import { connectLarder } from "@/lib/mcp-client";
import { originOf } from "@/lib/origin";
import { normalizeHousehold } from "@/lib/store";

const Body = z.object({ household: z.string().max(40), member: z.string().trim().max(40).optional(), name: z.string().max(40), arguments: z.record(z.string(), z.unknown()).default({}) });

/** The simulator's MCP Apps host relays tools/call requests from the card (a tap) to Larder's MCP endpoint. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { name, member } = parsed.data;
  const args = { ...parsed.data.arguments };
  if (member && ["pantry_update", "cart_add", "cart_remove", "order_confirm", "order_received"].includes(name) && !args.member) args.member = member;
  const larder = await connectLarder(originOf(req), normalizeHousehold(parsed.data.household), member);
  try {
    const out = await larder.call(name, args);
    return Response.json({ ok: out.ok, speech: out.speech, structuredContent: out.structured, isError: !out.ok, ms: out.ms });
  } finally {
    await larder.close().catch(() => {});
  }
}
