import { AISLE_ORDER, catalogItem, resolveItem, type Aisle, type Unit } from "./catalog";
import { RECIPES, findRecipe, recipeById, type Recipe } from "./recipes";

/**
 * The household's kitchen memory and every operation on it. Pure functions: each takes the
 * household, changes it in place when it must, and returns a voice-first result (one short
 * sentence to speak, plus structured data for a screen). Storage lives in store.ts.
 */
export type Level = "stocked" | "low" | "out";

export interface PantryEntry {
  key: string;
  name: string;
  aisle: Aisle | "other";
  unit: Unit;
  count?: number;
  level: Level;
  onOrder?: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface CartLine {
  key: string;
  name: string;
  aisle: Aisle | "other";
  qty?: number;
  note?: string;
  addedBy?: string;
}

export interface Order {
  id: string;
  lines: CartLine[];
  placedAt: string;
  placedBy?: string;
  status: "placed" | "delivered";
  deliveredAt?: string;
}

export interface Activity {
  at: string;
  who?: string;
  text: string;
}

export interface Household {
  id: string;
  version: 1;
  createdAt: string;
  updatedAt: string;
  pantry: Record<string, PantryEntry>;
  cart: CartLine[];
  pending?: { code: string; lines: CartLine[]; createdAt: string; expiresAt: string };
  orders: Order[];
  activity: Activity[];
  lastPlan?: { recipe: string; servings: number };
}

const now = () => new Date().toISOString();
const ORDER_CONFIRM_MS = 15 * 60_000;
const MAX_ACTIVITY = 40;

// ---------- language helpers (voice copy, no em dashes) ----------

export function list(words: string[], max = 4): string {
  const w = words.slice(0, words.length - max === 1 ? max + 1 : max);
  const extra = words.length - w.length;
  if (extra > 0) w.push(`${extra} more`);
  if (w.length <= 1) return w[0] ?? "";
  if (w.length === 2) return `${w[0]} and ${w[1]}`;
  return `${w.slice(0, -1).join(", ")}, and ${w[w.length - 1]}`;
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Kitchen-friendly amounts: 0.75 becomes "3/4", 2.25 becomes "2 1/4" (nearest quarter or third). */
export function fmtQty(n: number): string {
  if (n > 0 && n < 0.2) return "1/8";
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  const options: [number, string][] = [[0, ""], [0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"], [1, ""]];
  const [v, label] = options.reduce((best, o) => (Math.abs(o[0] - frac) < Math.abs(best[0] - frac) ? o : best));
  const w = v === 1 ? whole + 1 : whole;
  if (!label) return String(w);
  return w ? `${w} ${label}` : label;
}
const COUNTABLE_MEASURES = ["cup", "box", "clove", "slice", "stalk", "head"];
/** "1 1/2 cups", "3/4 cup", "2 boxes"; tsp, tbsp and lb stay as they are. */
function measureFor(m: string | undefined, q: number) {
  if (!m) return "";
  const [word, ...rest] = m.split(" ");
  const base = COUNTABLE_MEASURES.find((x) => word === x || word === `${x}s` || word === `${x}es`);
  if (!base) return m;
  const many = q > 1 + 1e-9;
  return [many ? (base === "box" ? "boxes" : `${base}s`) : base, ...rest].join(" ");
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function countPhrase(e: { name: string; key: string }, n: number) {
  const noun = catalogItem(e.key)?.noun;
  if (!noun) return `${n} ${e.name}`;
  if (n === 1) return `1 ${noun}`;
  if (noun.startsWith("can of ")) return `${n} cans of ${noun.slice(7)}`;
  return `${n} ${e.name}`;
}

// ---------- seed ----------

const SEED: [string, Level, number?][] = [
  ["eggs", "stocked", 2], ["milk", "low"], ["butter", "stocked"], ["cheddar", "stocked"], ["parmesan", "stocked"],
  ["onions", "stocked", 3], ["garlic", "stocked"], ["tomatoes", "stocked", 2], ["lemons", "stocked", 1], ["bananas", "stocked", 3],
  ["bell-peppers", "stocked", 1], ["carrots", "stocked", 4], ["spinach", "stocked"], ["scallions", "stocked"], ["chicken-breast", "stocked", 2],
  ["rice", "stocked"], ["pasta", "stocked"], ["flour", "stocked"], ["sugar", "stocked"], ["baking-powder", "stocked"],
  ["olive-oil", "low"], ["vegetable-oil", "stocked"], ["soy-sauce", "stocked"], ["crushed-tomatoes", "stocked", 1], ["black-beans", "stocked", 2],
  ["chicken-broth", "stocked"], ["tortillas", "stocked", 6], ["frozen-peas", "stocked"], ["maple-syrup", "stocked"], ["coffee", "low"],
  ["bread", "stocked"], ["salt", "stocked"], ["black-pepper", "stocked"], ["cumin", "stocked"], ["chili-powder", "stocked"],
  ["paprika", "stocked"], ["oregano", "stocked"], ["red-pepper-flakes", "stocked"], ["cinnamon", "stocked"],
];

export function newHousehold(id: string): Household {
  const t = now();
  const pantry: Record<string, PantryEntry> = {};
  for (const [key, level, count] of SEED) {
    const c = catalogItem(key)!;
    pantry[key] = { key, name: c.name, aisle: c.aisle, unit: c.unit, level, ...(count !== undefined ? { count } : {}), updatedAt: t };
  }
  return { id, version: 1, createdAt: t, updatedAt: t, pantry, cart: [], orders: [], activity: [{ at: t, text: "Kitchen set up with a starter pantry" }] };
}

function log(h: Household, text: string, who?: string) {
  h.activity.unshift({ at: now(), ...(who ? { who } : {}), text });
  h.activity = h.activity.slice(0, MAX_ACTIVITY);
  h.updatedAt = now();
}

function entryFor(h: Household, said: string): PantryEntry {
  const r = resolveItem(said);
  const existing = h.pantry[r.key];
  if (existing) return existing;
  const c = catalogItem(r.key);
  return { key: r.key, name: c?.name ?? r.name, aisle: c?.aisle ?? "other", unit: c?.unit ?? "status", level: "out", updatedAt: now() };
}

const isHave = (e?: PantryEntry) => !!e && e.level !== "out" && (e.unit !== "count" || (e.count ?? 0) > 0);

// ---------- pantry ----------

export type ChangeAction = "bought" | "used_some" | "used_up" | "running_low" | "forget";
export interface PantryChange { item: string; action: ChangeAction; count?: number }

export interface PantryView {
  key: string;
  name: string;
  aisle: string;
  level: Level;
  count?: number;
  onOrder?: boolean;
  updatedBy?: string;
}
const view = (e: PantryEntry): PantryView => ({ key: e.key, name: e.name, aisle: e.aisle, level: e.level, ...(e.unit === "count" ? { count: e.count ?? 0 } : {}), ...(e.onOrder ? { onOrder: true } : {}), ...(e.updatedBy ? { updatedBy: e.updatedBy } : {}) });

export function updatePantry(h: Household, changes: PantryChange[], who?: string) {
  const out: string[] = [];
  const low: string[] = [];
  const added: string[] = [];
  const used: string[] = [];
  const forgot: string[] = [];
  const touched: PantryView[] = [];
  for (const ch of changes) {
    const e = entryFor(h, ch.item);
    const n = ch.count && ch.count > 0 ? Math.round(ch.count) : undefined;
    switch (ch.action) {
      case "bought": {
        const prev = isHave(e) ? (e.count ?? 0) : 0;
        e.level = "stocked";
        if (e.unit === "count") e.count = prev + (n ?? 1);
        e.onOrder = false;
        added.push(e.unit === "count" ? countPhrase(e, n ?? 1) : e.name);
        break;
      }
      case "used_some":
        if (e.unit === "count") {
          e.count = Math.max(0, (e.count ?? 0) - (n ?? 1));
          e.level = e.count === 0 ? "out" : e.count <= 1 ? "low" : "stocked";
        }
        (e.level === "out" ? out : used).push(e.name);
        break;
      case "used_up":
        e.level = "out";
        if (e.unit === "count") e.count = 0;
        out.push(e.name);
        break;
      case "running_low":
        e.level = "low";
        if (e.unit === "count" && (e.count ?? 0) > 2) e.count = 1;
        low.push(e.name);
        break;
      case "forget":
        delete h.pantry[e.key];
        forgot.push(e.name);
        continue;
    }
    e.updatedAt = now();
    if (who) e.updatedBy = who;
    h.pantry[e.key] = e;
    touched.push(view(e));
  }
  const parts: string[] = [];
  if (added.length) parts.push(`added ${list(added)}`);
  if (out.length) parts.push(`${list(out)} ${out.length === 1 && !out[0].endsWith("s") ? "is" : "are"} out`);
  if (low.length) parts.push(`${list(low)} ${low.length === 1 && !low[0].endsWith("s") ? "is" : "are"} running low`);
  if (used.length) parts.push(`noted you used some ${list(used)}`);
  if (forgot.length) parts.push(`stopped tracking ${list(forgot)}`);
  if (parts.length) log(h, cap(parts.join("; ")), who);
  const needs = [...out, ...low];
  const notInCart = needs.filter((name) => !h.cart.some((c) => c.name === name));
  let speech = parts.length ? `Got it: ${parts.join(", and ")}.` : "I didn't catch an item to update.";
  if (notInCart.length) speech += ` Want me to add ${notInCart.length === 1 ? "it" : "them"} to your cart?`;
  return { kind: "pantry_update" as const, speech, changed: touched, suggestCart: notInCart };
}

export function checkPantry(h: Household, items?: string[]) {
  if (items?.length) {
    const lines = items.map((said) => {
      const r = resolveItem(said);
      const e = h.pantry[r.key];
      if (!e || e.level === "out" || (e.unit === "count" && !e.count)) return { said, entry: e ? view(e) : null, line: `you're out of ${e?.name ?? r.name}${e?.onOrder ? ", but it's on order" : ""}` };
      if (e.unit === "count") return { said, entry: view(e), line: `you have ${countPhrase(e, e.count!)}${e.level === "low" ? ", running low" : ""}` };
      return { said, entry: view(e), line: e.level === "low" ? `${e.name} is running low` : `you have ${e.name}` };
    });
    return { kind: "pantry_check" as const, speech: `${lines.map((l) => cap(l.line)).join(". ")}.`, items: lines.map(({ said, entry }) => ({ said, entry })), low: [], out: [], total: Object.keys(h.pantry).length };
  }
  const all = Object.values(h.pantry);
  const lowE = all.filter((e) => e.level === "low");
  const outE = all.filter((e) => !isHave(e));
  let speech = `You're tracking ${plural(all.length, "item")}.`;
  if (lowE.length) speech += ` Running low: ${list(lowE.map((e) => e.name))}.`;
  if (outE.length) speech += ` Out: ${list(outE.map((e) => e.name))}.`;
  if (!lowE.length && !outE.length) speech += " Nothing is low or out.";
  const sorted = all.sort((a, b) => AISLE_ORDER.indexOf(a.aisle as Aisle) - AISLE_ORDER.indexOf(b.aisle as Aisle) || a.name.localeCompare(b.name));
  return { kind: "pantry_check" as const, speech, items: sorted.map((e) => ({ said: e.name, entry: view(e) })), low: lowE.map((e) => e.name), out: outE.map((e) => e.name), total: all.length };
}

// ---------- recipes ----------

export interface Need { key: string; name: string; amount: string; status: "have" | "short" | "missing"; staple: boolean; buy?: number }

function scaleNeeds(h: Household, recipe: Recipe, servings: number): Need[] {
  const f = servings / recipe.serves;
  return recipe.ingredients.map((ing) => {
    const c = catalogItem(ing.item)!;
    const e = h.pantry[ing.item];
    if (c.unit === "count") {
      const need = Math.max(1, Math.ceil(ing.qty * f - 1e-9));
      const have = isHave(e) ? (e!.count ?? 0) : 0;
      const status = have >= need ? "have" : have > 0 ? "short" : "missing";
      return { key: c.key, name: c.name, amount: countPhrase({ key: c.key, name: c.name }, need), status, staple: !!ing.staple, ...(status !== "have" ? { buy: need - have } : {}) };
    }
    const q = ing.qty * f;
    const amount = `${fmtQty(q)} ${measureFor(ing.measure, q)} ${c.name}`.replace(/\s+/g, " ").trim();
    return { key: c.key, name: c.name, amount, status: isHave(e) || (ing.staple && !e) ? "have" : "missing", staple: !!ing.staple };
  });
}

export function suggestRecipes(h: Household, opts: { servings?: number; tag?: string; limit?: number } = {}) {
  const pool = RECIPES.filter((r) => !opts.tag || r.tags.includes(opts.tag.toLowerCase()));
  const ranked = (pool.length ? pool : RECIPES)
    .map((r) => {
      const servings = opts.servings ?? r.serves;
      const needs = scaleNeeds(h, r, servings);
      const gaps = needs.filter((n) => n.status !== "have");
      return { id: r.id, name: r.name, minutes: r.minutes, servings, tags: r.tags, missing: gaps.map((g) => g.name), haveCount: needs.length - gaps.length, total: needs.length };
    })
    .sort((a, b) => a.missing.length - b.missing.length || a.minutes - b.minutes)
    .slice(0, Math.min(Math.max(opts.limit ?? 5, 1), 8));
  const ready = ranked.filter((r) => r.missing.length === 0);
  const close = ranked.filter((r) => r.missing.length > 0 && r.missing.length <= 2);
  let speech = ready.length ? `You can make ${list(ready.map((r) => r.name.toLowerCase()), 3)} right now.` : "Nothing is fully covered right now.";
  if (close[0]) speech += ` ${close[0].name} just needs ${list(close[0].missing)}.`;
  return { kind: "recipe_suggestions" as const, speech, recipes: ranked };
}

export function planRecipe(h: Household, said: string, servings?: number) {
  const recipe = findRecipe(said);
  if (!recipe) return { kind: "recipe_plan" as const, speech: `I don't have a recipe for ${said} yet. I know ${list(RECIPES.slice(0, 4).map((r) => r.name.toLowerCase()))}, and a few more.`, recipe: null };
  const s = Math.min(Math.max(Math.round(servings ?? recipe.serves), 1), 24);
  const needs = scaleNeeds(h, recipe, s);
  const gaps = needs.filter((n) => n.status !== "have");
  h.lastPlan = { recipe: recipe.id, servings: s };
  h.updatedAt = now();
  const gapWords = gaps.map((g) => (g.status === "short" ? `${g.buy} more ${g.buy === 1 ? catalogItem(g.key)?.noun ?? g.name : g.name}` : g.name));
  const speech = gaps.length
    ? `${recipe.name} for ${s} needs ${plural(gaps.length, "thing")} you don't have: ${list(gapWords, 6)}. Want me to add ${gaps.length === 1 ? "it" : "them"} to your cart?`
    : `Good news: you have everything for ${recipe.name.toLowerCase()} for ${s}. It takes about ${recipe.minutes} minutes.`;
  return { kind: "recipe_plan" as const, speech, recipe: { id: recipe.id, name: recipe.name, servings: s, minutes: recipe.minutes, needs, steps: recipe.steps } };
}

// ---------- cart and orders ----------

function mergeLine(h: Household, line: CartLine) {
  const existing = h.cart.find((c) => c.key === line.key);
  if (existing) {
    if (line.qty) existing.qty = (existing.qty ?? 0) + line.qty;
    if (line.note && !existing.note?.includes(line.note)) existing.note = existing.note ? `${existing.note}; ${line.note}` : line.note;
    return false;
  }
  h.cart.push(line);
  return true;
}

export function addToCart(h: Household, input: { items?: { item: string; count?: number }[]; recipe?: string; servings?: number; from_last_plan?: boolean }, who?: string) {
  const added: string[] = [];
  let note: string | undefined;
  const recipeSaid = input.recipe ?? (input.from_last_plan || !input.items?.length ? h.lastPlan?.recipe : undefined);
  if (recipeSaid) {
    const recipe = recipeById(recipeSaid) ?? findRecipe(recipeSaid);
    if (recipe) {
      const servings = input.servings ?? (h.lastPlan?.recipe === recipe.id ? h.lastPlan.servings : recipe.serves);
      note = `${recipe.name} for ${servings}`;
      for (const n of scaleNeeds(h, recipe, servings).filter((x) => x.status !== "have")) {
        const c = catalogItem(n.key)!;
        mergeLine(h, { key: n.key, name: n.name, aisle: c.aisle, ...(n.buy ? { qty: n.buy } : {}), note, ...(who ? { addedBy: who } : {}) });
        added.push(n.name);
      }
    }
  }
  for (const it of input.items ?? []) {
    const r = resolveItem(it.item);
    const c = catalogItem(r.key);
    mergeLine(h, { key: r.key, name: c?.name ?? r.name, aisle: c?.aisle ?? "other", ...(it.count ? { qty: Math.round(it.count) } : {}), ...(who ? { addedBy: who } : {}) });
    added.push(c?.name ?? r.name);
  }
  if (added.length) log(h, `Added ${list(added)} to the cart${note ? ` (${note})` : ""}`, who);
  const speech = added.length
    ? `Added ${list(added)} to your cart. That's ${plural(h.cart.length, "item")} now. Say "place the order" when you're ready.`
    : recipeSaid ? "You already have everything for that, so nothing to add." : "Tell me what to add, or ask for a recipe first.";
  return { kind: "cart" as const, speech, added, cart: h.cart };
}

export function removeFromCart(h: Household, items: string[], who?: string) {
  const removed: string[] = [];
  for (const said of items) {
    const r = resolveItem(said);
    const i = h.cart.findIndex((c) => c.key === r.key || c.name.toLowerCase() === said.toLowerCase());
    if (i >= 0) removed.push(h.cart.splice(i, 1)[0].name);
  }
  if (removed.length) log(h, `Removed ${list(removed)} from the cart`, who);
  return { kind: "cart" as const, speech: removed.length ? `Removed ${list(removed)}. ${plural(h.cart.length, "item")} left in your cart.` : "Those weren't in your cart.", added: [], cart: h.cart };
}

export function viewCart(h: Household) {
  const speech = h.cart.length ? `Your cart has ${plural(h.cart.length, "item")}: ${list(h.cart.map((c) => c.name), 6)}.` : "Your cart is empty.";
  return { kind: "cart" as const, speech, added: [], cart: h.cart };
}

function code() {
  const words = ["apple", "basil", "cedar", "maple", "olive", "pepper", "sage", "thyme", "honey", "lemon"];
  return `${words[Math.floor(Math.random() * words.length)]}-${100 + Math.floor(Math.random() * 900)}`;
}

export function placeOrder(h: Household) {
  if (!h.cart.length) return { kind: "order_review" as const, speech: "Your cart is empty, so there's nothing to order yet.", confirmation_code: null, lines: [], expires_at: null, simulated: true };
  const pending = { code: code(), lines: h.cart.map((c) => ({ ...c })), createdAt: now(), expiresAt: new Date(Date.now() + ORDER_CONFIRM_MS).toISOString() };
  h.pending = pending;
  h.updatedAt = now();
  return {
    kind: "order_review" as const,
    speech: `Your order has ${plural(pending.lines.length, "item")}: ${list(pending.lines.map((l) => l.name), 5)}. Should I place it?`,
    confirmation_code: pending.code,
    lines: pending.lines,
    expires_at: pending.expiresAt,
    simulated: true,
  };
}

export function confirmOrder(h: Household, confirmationCode: string, who?: string) {
  const p = h.pending;
  if (!p) return { kind: "order_placed" as const, ok: false, speech: "There's no order waiting for confirmation. Say \"place the order\" to review your cart first.", order: null };
  if (Date.parse(p.expiresAt) < Date.now()) {
    h.pending = undefined;
    return { kind: "order_placed" as const, ok: false, speech: "That order review expired, so I didn't place it. Say \"place the order\" to review it again.", order: null };
  }
  if (confirmationCode.trim().toLowerCase() !== p.code) return { kind: "order_placed" as const, ok: false, speech: "That confirmation doesn't match the order under review, so I didn't place anything.", order: null };
  const order: Order = { id: `ord-${Date.now().toString(36)}`, lines: p.lines, placedAt: now(), ...(who ? { placedBy: who } : {}), status: "placed" };
  h.orders.unshift(order);
  h.orders = h.orders.slice(0, 10);
  const keys = new Set(p.lines.map((l) => l.key));
  h.cart = h.cart.filter((c) => !keys.has(c.key));
  for (const l of p.lines) if (h.pantry[l.key]) h.pantry[l.key].onOrder = true;
  h.pending = undefined;
  log(h, `Placed an order for ${plural(order.lines.length, "item")}`, who);
  return { kind: "order_placed" as const, ok: true, speech: `Done. I placed your order for ${plural(order.lines.length, "item")}. When it arrives, just tell me and I'll restock the pantry.`, order };
}

export function receiveOrder(h: Household, who?: string) {
  const order = h.orders.find((o) => o.status === "placed");
  if (!order) return { kind: "order_received" as const, speech: "I don't see an order on the way.", restocked: [] as string[] };
  for (const l of order.lines) {
    const c = catalogItem(l.key);
    const e = h.pantry[l.key] ?? { key: l.key, name: l.name, aisle: l.aisle, unit: c?.unit ?? "status", level: "out" as Level, updatedAt: now() };
    e.level = "stocked";
    e.onOrder = false;
    if (e.unit === "count") e.count = (e.count ?? 0) + (l.qty ?? 1);
    e.updatedAt = now();
    if (who) e.updatedBy = who;
    h.pantry[l.key] = e;
  }
  order.status = "delivered";
  order.deliveredAt = now();
  const names = order.lines.map((l) => l.name);
  log(h, `Restocked ${list(names)} from the delivery`, who);
  return { kind: "order_received" as const, speech: `Welcome back. I restocked ${list(names, 5)}.`, restocked: names };
}

export function recap(h: Household, limit = 6) {
  const items = h.activity.slice(0, Math.min(Math.max(limit, 1), 20));
  const spoken = items.slice(0, 4).map((a) => `${a.who ? `${a.who}: ` : ""}${a.text.charAt(0).toLowerCase()}${a.text.slice(1)}`);
  const speech = items.length ? `Here's what changed in the kitchen. ${cap(spoken.join(". "))}.` : "Nothing has changed in the kitchen yet.";
  return { kind: "recap" as const, speech, activity: items, pending: h.pending ? { code: h.pending.code, items: h.pending.lines.length } : null, cartCount: h.cart.length };
}

export function snapshot(h: Household) {
  return { id: h.id, updatedAt: h.updatedAt, pantry: checkPantry(h).items.map((i) => i.entry!), cart: h.cart, pending: h.pending ? { code: h.pending.code, lines: h.pending.lines.length, expiresAt: h.pending.expiresAt } : null, orders: h.orders.slice(0, 3), activity: h.activity.slice(0, 8), lastPlan: h.lastPlan ?? null };
}
