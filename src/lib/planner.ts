import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { findRecipe } from "./recipes";
import { chatJson } from "./llm";
import type { ToolInfo } from "./mcp-client";

/**
 * Turns one spoken sentence into Larder MCP tool calls. In production Alexa+ is this layer; here an
 * open model plays its part, reading the live tools/list. When the model is unavailable or today's
 * allowance is spent, a small offline intent matcher covers the common kitchen phrases.
 */
export interface PlannedCall { name: string; arguments: Record<string, unknown> }
export interface Plan { calls: PlannedCall[]; say?: string; source: "model" | "offline" | "cache"; model?: string; note?: string }
export interface Turn { user: string; speech: string; tools: string[]; confirmation_code?: string | null }

const PlanSchema = z.object({
  calls: z.array(z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).default({}) })).max(4).default([]),
  say: z.string().max(300).optional(),
});

function toolBrief(tools: ToolInfo[]) {
  return tools.map((t) => `- ${t.name}: ${t.description}\n  input: ${JSON.stringify(t.inputSchema)}`).join("\n");
}

function context(history: Turn[]) {
  const recent = history.slice(-3);
  if (!recent.length) return "(start of conversation)";
  return recent.map((t) => `User: ${t.user}\nAssistant (via ${t.tools.join(", ") || "no tools"}): ${t.speech}${t.confirmation_code ? `\n[order under review, confirmation_code=${t.confirmation_code}]` : ""}`).join("\n");
}

const SYSTEM = (tools: ToolInfo[], member?: string) => `You are the orchestration layer of a voice assistant in a family kitchen (like Alexa+). You do not answer from your own knowledge about the household; you call the Larder MCP tools, and the assistant speaks their results.
Return ONE JSON object: {"calls":[{"name":"<tool>","arguments":{...}}],"say":"<only if no tool fits>"}.
Rules:
- Use 1 to 3 calls, in the order they should run. Arguments must match each tool's input schema exactly.
- Food used, finished, bought, or running low: pantry_update (one call, several changes). Counting words: "a dozen" = 12, "a couple" = 2.
- "Make X for N" or "cook X": recipe_plan with servings. "What can I make": recipes_suggest.
- "Yes", "add them", "add those", "sure" after the assistant offered to add items: cart_add (no arguments uses the last planned recipe; otherwise pass the items that were offered).
- "Order it", "check out", "place the order": order_place. Never call order_confirm unless the user clearly says yes AND an order is under review; then pass its exact confirmation_code from the context.
- The speaker is ${member ? `"${member}"; pass member:"${member}" on tools that accept it` : "unknown"}.
- If the request has nothing to do with the kitchen, return no calls and a one-sentence "say".
Tools:
${toolBrief(tools)}`;

const cache = new Map<string, Plan>();

export async function planWithModel(utterance: string, history: Turn[], tools: ToolInfo[], member?: string): Promise<Plan> {
  const prompt = `Conversation so far:\n${context(history)}\n\nUser now says: "${utterance}"`;
  const key = createHash("sha256").update(JSON.stringify([utterance.toLowerCase().trim(), context(history), member ?? ""])).digest("hex");
  const hit = cache.get(key);
  if (hit) return { ...hit, source: "cache" };
  const { json, model } = await chatJson(SYSTEM(tools, member), prompt);
  const parsed = PlanSchema.parse(json);
  const names = new Set(tools.map((t) => t.name));
  const plan: Plan = { calls: parsed.calls.filter((c) => names.has(c.name)).slice(0, 3), say: parsed.say, source: "model", model };
  if (member) for (const c of plan.calls) if (["pantry_update", "cart_add", "cart_remove", "order_confirm", "order_received"].includes(c.name) && !c.arguments.member) c.arguments.member = member;
  cache.set(key, plan);
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return plan;
}

// ---------------- offline intent matcher ----------------

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, couple: 2, few: 3 };
const num = (w?: string) => (w ? (/^\d+$/.test(w) ? Number(w) : NUM[w.toLowerCase()]) : undefined);

function splitItems(s: string) {
  return s.split(/,|\band\b|&/).map((x) => x.replace(/^\s*(the|some|our|my|a|an)\s+/i, "").replace(/\b(please|too|as well|now|today)\b/gi, "").trim()).filter((x) => x.length > 1);
}

export function planOffline(utterance: string, history: Turn[], member?: string): Plan {
  const u = utterance.toLowerCase().replace(/[.!?]+$/g, "").replace(/^(alexa|hey alexa)[, ]*/, "").trim();
  const last = history[history.length - 1];
  const m = member ? { member } : {};
  const one = (name: string, args: Record<string, unknown> = {}): Plan => ({ calls: [{ name, arguments: args }], source: "offline" });
  let r: RegExpMatchArray | null;

  if (/^(yes|yeah|yep|sure|ok|okay|do it|please do|confirm|go ahead|place it)\b/.test(u)) {
    if (last?.confirmation_code) return one("order_confirm", { confirmation_code: last.confirmation_code, ...m });
    if (last && /add (it|them) to your cart/i.test(last.speech)) {
      if (last.tools.includes("recipe_plan")) return one("cart_add", { from_last_plan: true, ...m });
      const offered = last.speech.match(/^Got it: (.*?)\. Want me/)?.[1] ?? "";
      const items = [...offered.matchAll(/([a-z][a-z ]+?) (?:is|are) (?:out|running low)/g)].flatMap((x) => splitItems(x[1]));
      if (items.length) return one("cart_add", { items: items.map((item) => ({ item })), ...m });
    }
  }
  if (/\b(no|nope|cancel|never mind)\b/.test(u) && last?.confirmation_code) return { calls: [], say: "Okay, I won't place it. Your cart is still there.", source: "offline" };
  if (/\b(arrived|are here|got delivered|delivery came|groceries came)\b/.test(u)) return one("order_received", m);
  if (/\b(place|submit|check ?out|order)\b.*\b(order|it|cart|groceries)?\b/.test(u) && /\b(place|submit|check ?out|order (it|them|everything|the cart))\b/.test(u)) return one("order_place");
  if (/what('s| is) in (my|the) cart|read (me )?(my|the) cart/.test(u)) return one("cart_view");
  if ((r = u.match(/(?:remove|take|drop) (.+?) (?:from|off|out of) (?:my |the )?cart/))) return one("cart_remove", { items: splitItems(r[1]), ...m });
  if (/(what('s| has)? changed|recap|what happened|who (used|finished|ate))/.test(u)) return one("kitchen_recap");
  if ((r = u.match(/(?:make|cook|making|cooking|plan) (.+?)(?: for (\w+)(?: people)?)?(?: on \w+| tonight| tomorrow| this weekend)?$/)) && findRecipe(r[1])) {
    return one("recipe_plan", { recipe: r[1], ...(num(r[2]) ? { servings: num(r[2]) } : {}) });
  }
  if (/what can (i|we) (make|cook)|dinner ideas|what should (i|we) (make|cook)|ideas for (dinner|breakfast)/.test(u)) {
    const tag = u.includes("breakfast") ? "breakfast" : u.includes("quick") ? "quick" : u.includes("vegetarian") ? "vegetarian" : undefined;
    return one("recipes_suggest", tag ? { tag } : {});
  }
  if (/^add (them|those|it|what'?s missing|the missing (stuff|items|ones))$/.test(u)) return one("cart_add", { from_last_plan: true, ...m });
  if ((r = u.match(/add (.+?) to (?:my |the )?(?:cart|list|shopping list)/))) {
    if (/\b(what'?s missing|the missing|them|those|it)\b/.test(r[1])) return one("cart_add", { from_last_plan: true, ...m });
    return one("cart_add", { items: splitItems(r[1]).map((item) => ({ item })), ...m });
  }
  const changes: { item: string; action: string; count?: number }[] = [];
  for (const clause of u.split(/[.;]|\bbut\b|,? (?:and|also) (?=(?:we|we're|i|i'm|low|running|getting|out|bought|used|got|picked|finished|ran)\b)/)) {
    let c: RegExpMatchArray | null;
    if ((c = clause.match(/(?:we're|we are|i'm|i am)? ?(?:out of|used (?:up )?(?:all|the last) (?:of )?|finished(?: off)?|ran out of) (.+)/))) splitItems(c[1]).forEach((item) => changes.push({ item, action: "used_up" }));
    else if ((c = clause.match(/(?:running |getting |we're |we are )?low on (.+)/))) splitItems(c[1]).forEach((item) => changes.push({ item, action: "running_low" }));
    else if ((c = clause.match(/(?:bought|picked up|got|added|we have) (?:(a dozen|a couple(?: of)?|\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve) )?(.+)/))) {
      const n = num(c[1]?.replace(/^a (dozen|couple).*/, "$1"));
      splitItems(c[2]).forEach((item, i) => changes.push({ item, action: "bought", ...(i === 0 && n && n > 1 ? { count: n } : {}) }));
    } else if ((c = clause.match(/used (\w+) (.+)/)) && num(c[1])) changes.push({ item: c[2], action: "used_some", count: num(c[1]) });
  }
  if (changes.length) return one("pantry_update", { changes: changes.slice(0, 12), ...m });
  if ((r = u.match(/(?:do we have|is there|are there|how many|how much) (?:any )?(.+?)(?: left| in the (?:kitchen|pantry|fridge))?$/))) return one("pantry_check", { items: splitItems(r[1]) });
  if (/what('s| is) in (the |my )?(kitchen|pantry|fridge)|what do we have|what('s| is) (low|running low)/.test(u)) return one("pantry_check");
  return { calls: [], say: "I can keep track of your kitchen. Try \"we're out of eggs\", \"what can I make tonight?\", or \"make lasagna for six\".", source: "offline" };
}
