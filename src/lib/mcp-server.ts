import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CARD_HTML, CARD_MIME, CARD_URI } from "./card-html";
import * as K from "./household";
import { normalizeHousehold, withHousehold } from "./store";

/**
 * Larder as an MCP server: the household kitchen memory an Alexa+ style assistant calls.
 * Every tool returns structuredContent with a `speech` line written to be read aloud, and links the
 * MCP Apps card (ui://larder/kitchen-card.html) so screen devices can show and act on the result.
 */
export const SERVER_INFO = { name: "larder", title: "Larder", version: "1.0.0" };

export const INSTRUCTIONS = [
  "Larder is a household's shared kitchen memory: pantry, recipes on hand, cart, and confirmed grocery orders.",
  "Read the `speech` field of each result aloud as your reply; it is one or two short sentences written for voice.",
  "When someone mentions using, finishing, buying, or running low on food, call pantry_update.",
  "Purchasing is two steps: order_place returns a confirmation_code and a summary; ask the person, and only call order_confirm after a clear yes.",
  "Pass `member` (the speaker's first name) on changes so the family activity log shows who did what.",
].join(" ");

const member = z.string().trim().min(1).max(40).optional().describe("First name of the person speaking, for the shared activity log, e.g. 'Maya'.");
const item = z.string().trim().min(1).max(60);
const ui = { ui: { resourceUri: CARD_URI } };

const entry = z.object({ key: z.string(), name: z.string(), aisle: z.string(), level: z.enum(["stocked", "low", "out"]), count: z.number().optional(), onOrder: z.boolean().optional(), updatedBy: z.string().optional() });
const line = z.object({ key: z.string(), name: z.string(), aisle: z.string(), qty: z.number().optional(), note: z.string().optional(), addedBy: z.string().optional() });
const base = <T extends string>(kind: T) => ({ kind: z.literal(kind), speech: z.string().describe("Say this aloud."), household: z.string() });

const OUT = {
  pantry_update: z.object({ ...base("pantry_update"), changed: z.array(entry), suggestCart: z.array(z.string()) }),
  pantry_check: z.object({ ...base("pantry_check"), items: z.array(z.object({ said: z.string(), entry: entry.nullable() })), low: z.array(z.string()), out: z.array(z.string()), total: z.number() }),
  recipe_suggestions: z.object({ ...base("recipe_suggestions"), recipes: z.array(z.object({ id: z.string(), name: z.string(), minutes: z.number(), servings: z.number(), tags: z.array(z.string()), missing: z.array(z.string()), haveCount: z.number(), total: z.number() })) }),
  recipe_plan: z.object({
    ...base("recipe_plan"),
    recipe: z.object({ id: z.string(), name: z.string(), servings: z.number(), minutes: z.number(), steps: z.array(z.string()), needs: z.array(z.object({ key: z.string(), name: z.string(), amount: z.string(), status: z.enum(["have", "short", "missing"]), staple: z.boolean(), buy: z.number().optional() })) }).nullable(),
  }),
  cart: z.object({ ...base("cart"), added: z.array(z.string()), cart: z.array(line) }),
  order_review: z.object({ ...base("order_review"), confirmation_code: z.string().nullable(), lines: z.array(line), expires_at: z.string().nullable(), simulated: z.literal(true) }),
  order_placed: z.object({ ...base("order_placed"), ok: z.boolean(), order: z.object({ id: z.string(), lines: z.array(line), placedAt: z.string(), placedBy: z.string().optional(), status: z.enum(["placed", "delivered"]) }).nullable() }),
  order_received: z.object({ ...base("order_received"), restocked: z.array(z.string()) }),
  recap: z.object({ ...base("recap"), activity: z.array(z.object({ at: z.string(), who: z.string().optional(), text: z.string() })), pending: z.object({ code: z.string(), items: z.number() }).nullable(), cartCount: z.number() }),
};

type Ctx = { http?: { req?: Request } };
/** The household comes from the MCP URL (?household=...) or an x-larder-household header; default is the shared demo kitchen. */
export function householdOf(ctx: Ctx): string {
  const req = ctx.http?.req;
  if (!req) return normalizeHousehold(null);
  return normalizeHousehold(req.headers.get("x-larder-household") ?? new URL(req.url).searchParams.get("household"));
}
const speakerOf = (ctx: Ctx, m?: string) => m ?? ctx.http?.req?.headers.get("x-larder-member") ?? undefined;

function reply<T extends { speech: string }>(household: string, result: T) {
  const structured = { ...result, household };
  return { content: [{ type: "text" as const, text: result.speech }], structuredContent: structured as Record<string, unknown> };
}

export function registerLarder(server: McpServer) {
  server.registerResource(
    "kitchen-card",
    CARD_URI,
    { title: "Larder kitchen card", description: "Echo Show style card for any Larder result (MCP Apps view).", mimeType: CARD_MIME },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: CARD_MIME, text: CARD_HTML, _meta: { ui: { prefersBorder: false } } }] }),
  );

  server.registerTool(
    "pantry_update",
    {
      title: "Update the pantry",
      description:
        "Record what happened to food in this household's kitchen. Use for 'we're out of eggs', 'I used the last of the milk', 'bought a dozen eggs', 'we're low on olive oil', 'used two onions'. Accepts several changes at once. Actions: bought (adds stock; count for countable items like eggs), used_some (subtracts count), used_up (now out), running_low, forget (stop tracking). The reply offers to add anything out or low to the cart.",
      inputSchema: z.object({
        changes: z.array(z.object({ item: item.describe("What was said, e.g. 'eggs', 'the EVOO', 'a can of tomatoes'"), action: z.enum(["bought", "used_some", "used_up", "running_low", "forget"]), count: z.number().int().min(1).max(200).optional().describe("How many, for countable items: 12 for a dozen eggs") })).min(1).max(12),
        member,
      }),
      outputSchema: OUT.pantry_update,
      annotations: { title: "Update the pantry", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: ui,
    },
    async ({ changes, member: m }, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.updatePantry(hh, changes, speakerOf(ctx, m))));
    },
  );

  server.registerTool(
    "pantry_check",
    {
      title: "Check the pantry",
      description: "Answer 'do we have eggs?', 'how many onions are left?', or 'what's in the kitchen?' from this household's remembered pantry. Pass items to ask about specific foods, or nothing for a summary of what is low and out.",
      inputSchema: z.object({ items: z.array(item).max(12).optional().describe("Foods to look up; omit for a full summary") }),
      outputSchema: OUT.pantry_check,
      annotations: { title: "Check the pantry", readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async ({ items }, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.checkPantry(hh, items)));
    },
  );

  server.registerTool(
    "recipes_suggest",
    {
      title: "Suggest what to cook",
      description: "Rank Larder's recipes by how much of each this household already has, for 'what can I make tonight?' or 'any quick vegetarian dinners?'. Returns a carousel with what each recipe is missing.",
      inputSchema: z.object({
        servings: z.number().int().min(1).max(24).optional().describe("How many people"),
        tag: z.enum(["dinner", "breakfast", "lunch", "quick", "vegetarian", "family", "crowd", "comfort", "healthy", "make-ahead", "one-pan", "leftovers"]).optional(),
        limit: z.number().int().min(1).max(8).optional(),
      }),
      outputSchema: OUT.recipe_suggestions,
      annotations: { title: "Suggest what to cook", readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async (args, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.suggestRecipes(hh, args)));
    },
  );

  server.registerTool(
    "recipe_plan",
    {
      title: "Plan a recipe",
      description: "Scale one recipe to a number of people and compare it with the pantry: what is on hand, what is short, what is missing, plus the steps. Use for 'make lasagna for six on Saturday'. Remembers the plan so 'add what's missing' works next.",
      inputSchema: z.object({ recipe: z.string().trim().min(2).max(80).describe("Recipe name as said, e.g. 'lasagna'"), servings: z.number().int().min(1).max(24).optional() }),
      outputSchema: OUT.recipe_plan,
      annotations: { title: "Plan a recipe", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    async ({ recipe, servings }, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.planRecipe(hh, recipe, servings)));
    },
  );

  server.registerTool(
    "cart_add",
    {
      title: "Add to the grocery cart",
      description: "Add groceries to the household cart. Either name items, or pass a recipe (and servings) to add only what the pantry is missing for it. With no arguments, adds what is missing for the last planned recipe.",
      inputSchema: z.object({
        items: z.array(z.object({ item, count: z.number().int().min(1).max(50).optional() })).max(20).optional(),
        recipe: z.string().trim().min(2).max(80).optional(),
        servings: z.number().int().min(1).max(24).optional(),
        from_last_plan: z.boolean().optional().describe("Add what is missing for the recipe planned last"),
        member,
      }),
      outputSchema: OUT.cart,
      annotations: { title: "Add to the grocery cart", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: ui,
    },
    async ({ member: m, ...input }, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.addToCart(hh, input, speakerOf(ctx, m))));
    },
  );

  server.registerTool(
    "cart_remove",
    {
      title: "Remove from the cart",
      description: "Take items out of the household cart, e.g. 'never mind the ricotta'.",
      inputSchema: z.object({ items: z.array(item).min(1).max(20), member }),
      outputSchema: OUT.cart,
      annotations: { title: "Remove from the cart", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      _meta: ui,
    },
    async ({ items, member: m }, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.removeFromCart(hh, items, speakerOf(ctx, m))));
    },
  );

  server.registerTool(
    "cart_view",
    {
      title: "Read the cart",
      description: "What is in the household grocery cart right now.",
      inputSchema: z.object({}),
      outputSchema: OUT.cart,
      annotations: { title: "Read the cart", readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async (_args, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.viewCart(hh)));
    },
  );

  server.registerTool(
    "order_place",
    {
      title: "Review the order",
      description: "Step one of purchasing. Turns the cart into an order for review and returns a confirmation_code that expires in 15 minutes. Nothing is ordered yet: read the summary to the person and ask them to confirm. Orders are simulated; there is no store or payment.",
      inputSchema: z.object({}),
      outputSchema: OUT.order_review,
      annotations: { title: "Review the order", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: ui,
    },
    async (_args, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.placeOrder(hh)));
    },
  );

  server.registerTool(
    "order_confirm",
    {
      title: "Place the order",
      description: "Step two of purchasing. Call only after the person clearly says yes to the order_place summary, passing its confirmation_code. Places the (simulated) order, clears those items from the cart, and marks them on order in the pantry.",
      inputSchema: z.object({ confirmation_code: z.string().trim().min(3).max(40), member }),
      outputSchema: OUT.order_placed,
      annotations: { title: "Place the order", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: ui,
    },
    async ({ confirmation_code, member: m }, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.confirmOrder(hh, confirmation_code, speakerOf(ctx, m))));
    },
  );

  server.registerTool(
    "order_received",
    {
      title: "Restock from a delivery",
      description: "When groceries arrive ('the groceries are here'), restock the pantry from the most recent placed order.",
      inputSchema: z.object({ member }),
      outputSchema: OUT.order_received,
      annotations: { title: "Restock from a delivery", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: ui,
    },
    async ({ member: m }, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.receiveOrder(hh, speakerOf(ctx, m))));
    },
  );

  server.registerTool(
    "kitchen_recap",
    {
      title: "What changed in the kitchen",
      description: "The household's shared activity log across conversations and family members: who used up what, what was added to the cart, orders placed and delivered. Use for 'what changed since this morning?' or 'who finished the milk?'.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      outputSchema: OUT.recap,
      annotations: { title: "What changed in the kitchen", readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    async ({ limit }, ctx) => {
      const h = householdOf(ctx);
      return reply(h, await withHousehold(h, (hh) => K.recap(hh, limit)));
    },
  );

  server.registerPrompt(
    "weekly_restock",
    {
      title: "Weekly restock",
      description: "Walk the household through what is low or out, three dinners they can make this week, and one confirmed order.",
      argsSchema: z.object({ people: z.string().optional().describe("How many people to cook for, e.g. '4'") }),
    },
    async ({ people }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Help me restock the kitchen for the week${people ? ` for ${people} people` : ""}. Use Larder: check the pantry for what is low or out, suggest three dinners we can make with what we have, add what is missing to the cart, then review the order with me and wait for my yes before confirming.`,
          },
        },
      ],
    }),
  );
}
