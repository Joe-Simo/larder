import { z } from "zod";
import { gate } from "@/lib/allowance";
import { llmEnabled, llmResting } from "@/lib/llm";
import { connectLarder, type CallOutcome } from "@/lib/mcp-client";
import { originOf } from "@/lib/origin";
import { planOffline, planWithModel, type Plan } from "@/lib/planner";
import { normalizeHousehold } from "@/lib/store";

export const maxDuration = 60;

const Body = z.object({
  utterance: z.string().trim().min(1).max(300),
  household: z.string().max(40),
  member: z.string().trim().max(40).optional(),
  history: z.array(z.object({ user: z.string().max(300), speech: z.string().max(800), tools: z.array(z.string()).max(4), confirmation_code: z.string().max(40).nullable().optional() })).max(6).default([]),
  wantCard: z.boolean().optional(),
});

/**
 * One simulated Alexa+ turn: plan the utterance (open model, or the offline matcher), then run the
 * planned calls against Larder's MCP endpoint over Streamable HTTP, and return what to say and show.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say something for Larder to do." }, { status: 400 });
  const { utterance, member, history, wantCard } = parsed.data;
  const household = normalizeHousehold(parsed.data.household);

  const larder = await connectLarder(originOf(req), household, member);
  try {
    const tools = await larder.tools();
    let plan: Plan | null = null;
    let cookie: string | undefined;
    let note: string | undefined;
    const g = gate(req);
    if (!llmEnabled()) note = "No model key is set, so the offline intent matcher is planning.";
    else if (llmResting()) note = "Today's free model quota is used up, so the offline intent matcher is planning.";
    else if (!g.ok) note = g.reason === "visitor" ? "You've used today's model-planned turns, so the offline intent matcher is planning. It handles the common kitchen phrases." : "Today's shared model allowance is spent, so the offline intent matcher is planning.";
    else {
      try {
        plan = await planWithModel(utterance, history, tools, member);
        if (plan.source === "model") cookie = g.commit();
      } catch (err) {
        note = "The open model didn't answer in time, so the offline intent matcher planned this turn.";
        console.error("[larder] planner fell back:", err instanceof Error ? err.message : err);
      }
    }
    plan ??= planOffline(utterance, history, member);

    const calls: CallOutcome[] = [];
    for (const c of plan.calls) {
      const out = await larder.call(c.name, c.arguments);
      calls.push(out);
      if (!out.ok) break;
    }
    const speech = calls.length ? calls.map((c) => c.speech).filter(Boolean).slice(-2).join(" ") : plan.say ?? "Sorry, I didn't catch that.";
    const withCard = [...calls].reverse().find((c) => c.ok && c.structured);
    const cardUri = withCard ? tools.find((t) => t.name === withCard.name)?.uiResource ?? null : null;
    const cardHtml = wantCard && cardUri ? await larder.readResource(cardUri) : undefined;

    const body = {
      speech,
      plan: { source: plan.source, model: plan.model ?? null, note: note ?? null },
      calls: calls.map(({ name, arguments: a, ok, ms }) => ({ name, arguments: a, ok, ms })),
      card: withCard ? { uri: cardUri, tool: withCard.name, result: withCard.structured } : null,
      ...(cardHtml ? { cardHtml } : {}),
      confirmation_code: (withCard?.structured?.confirmation_code as string | null | undefined) ?? null,
      mcp: { protocolVersion: larder.protocolVersion, server: larder.server ?? null, transport: "streamable-http" },
      household,
      ms: Date.now() - started,
    };
    return Response.json(body, cookie ? { headers: { "set-cookie": cookie } } : undefined);
  } finally {
    await larder.close().catch(() => {});
  }
}
