/**
 * The kitchen vocabulary Larder understands. Each item has one canonical key, the words people
 * actually say for it, an aisle for grouping, and how it is counted. Items not listed here are
 * still accepted as free text; they just are not counted.
 */
export type Unit = "count" | "status";
export type Aisle = "produce" | "dairy" | "meat" | "bakery" | "pantry" | "frozen" | "spices";

export interface CatalogItem {
  key: string;
  name: string;
  aisle: Aisle;
  /** "count" items are tracked as a number (eggs, onions); "status" items as stocked, low or out (flour, olive oil). */
  unit: Unit;
  /** Singular noun for counted items, e.g. "egg". */
  noun?: string;
  aliases?: string[];
}

const C = (key: string, name: string, aisle: Aisle, unit: Unit, extra: Partial<CatalogItem> = {}): CatalogItem => ({ key, name, aisle, unit, ...extra });

export const CATALOG: CatalogItem[] = [
  C("eggs", "eggs", "dairy", "count", { noun: "egg" }),
  C("milk", "milk", "dairy", "status"),
  C("butter", "butter", "dairy", "status"),
  C("cheddar", "cheddar cheese", "dairy", "status", { aliases: ["cheddar", "cheese", "shredded cheese"] }),
  C("mozzarella", "mozzarella", "dairy", "status", { aliases: ["mozzarella cheese"] }),
  C("parmesan", "parmesan", "dairy", "status", { aliases: ["parmesan cheese", "parm"] }),
  C("ricotta", "ricotta", "dairy", "status", { aliases: ["ricotta cheese"] }),
  C("sour-cream", "sour cream", "dairy", "status"),
  C("yogurt", "yogurt", "dairy", "status", { aliases: ["greek yogurt"] }),
  C("tortillas", "tortillas", "bakery", "count", { noun: "tortilla", aliases: ["flour tortillas", "corn tortillas", "wraps"] }),
  C("bread", "bread", "bakery", "status", { aliases: ["sandwich bread", "loaf of bread"] }),
  C("onions", "onions", "produce", "count", { noun: "onion", aliases: ["yellow onion", "yellow onions"] }),
  C("garlic", "garlic", "produce", "status", { aliases: ["garlic cloves", "head of garlic"] }),
  C("tomatoes", "tomatoes", "produce", "count", { noun: "tomato" }),
  C("lemons", "lemons", "produce", "count", { noun: "lemon" }),
  C("limes", "limes", "produce", "count", { noun: "lime" }),
  C("bananas", "bananas", "produce", "count", { noun: "banana" }),
  C("bell-peppers", "bell peppers", "produce", "count", { noun: "bell pepper", aliases: ["peppers", "red peppers", "red pepper", "green peppers"] }),
  C("carrots", "carrots", "produce", "count", { noun: "carrot" }),
  C("celery", "celery", "produce", "status"),
  C("spinach", "spinach", "produce", "status", { aliases: ["baby spinach"] }),
  C("basil", "basil", "produce", "status", { aliases: ["fresh basil"] }),
  C("cilantro", "cilantro", "produce", "status"),
  C("avocados", "avocados", "produce", "count", { noun: "avocado" }),
  C("potatoes", "potatoes", "produce", "count", { noun: "potato" }),
  C("broccoli", "broccoli", "produce", "status"),
  C("scallions", "scallions", "produce", "status", { aliases: ["green onions", "spring onions"] }),
  C("ginger", "ginger", "produce", "status", { aliases: ["fresh ginger"] }),
  C("chicken-breast", "chicken breasts", "meat", "count", { noun: "chicken breast", aliases: ["chicken", "chicken breast"] }),
  C("ground-beef", "ground beef", "meat", "status", { aliases: ["beef", "mince", "hamburger meat"] }),
  C("salmon", "salmon fillets", "meat", "count", { noun: "salmon fillet", aliases: ["salmon", "salmon fillet"] }),
  C("italian-sausage", "Italian sausage", "meat", "status", { aliases: ["sausage"] }),
  C("bacon", "bacon", "meat", "status"),
  C("rice", "rice", "pantry", "status", { aliases: ["white rice", "jasmine rice"] }),
  C("pasta", "pasta", "pantry", "status", { aliases: ["spaghetti", "penne", "noodles"] }),
  C("lasagna-noodles", "lasagna noodles", "pantry", "status", { aliases: ["lasagna sheets"] }),
  C("egg-noodles", "egg noodles", "pantry", "status"),
  C("flour", "flour", "pantry", "status", { aliases: ["all purpose flour", "all-purpose flour"] }),
  C("sugar", "sugar", "pantry", "status", { aliases: ["white sugar"] }),
  C("brown-sugar", "brown sugar", "pantry", "status"),
  C("baking-powder", "baking powder", "pantry", "status"),
  C("baking-soda", "baking soda", "pantry", "status"),
  C("olive-oil", "olive oil", "pantry", "status", { aliases: ["extra virgin olive oil", "evoo"] }),
  C("vegetable-oil", "vegetable oil", "pantry", "status", { aliases: ["oil", "canola oil"] }),
  C("soy-sauce", "soy sauce", "pantry", "status"),
  C("crushed-tomatoes", "crushed tomatoes", "pantry", "count", { noun: "can of crushed tomatoes", aliases: ["canned tomatoes", "can of tomatoes", "tomato sauce", "marinara", "pasta sauce"] }),
  C("black-beans", "black beans", "pantry", "count", { noun: "can of black beans", aliases: ["canned black beans", "beans"] }),
  C("kidney-beans", "kidney beans", "pantry", "count", { noun: "can of kidney beans" }),
  C("chicken-broth", "chicken broth", "pantry", "status", { aliases: ["chicken stock", "broth", "stock"] }),
  C("tomato-soup", "tomato soup", "pantry", "count", { noun: "can of tomato soup" }),
  C("peanut-butter", "peanut butter", "pantry", "status"),
  C("maple-syrup", "maple syrup", "pantry", "status", { aliases: ["syrup"] }),
  C("vanilla", "vanilla extract", "pantry", "status", { aliases: ["vanilla"] }),
  C("oats", "oats", "pantry", "status", { aliases: ["rolled oats", "oatmeal"] }),
  C("coffee", "coffee", "pantry", "status", { aliases: ["coffee beans", "ground coffee"] }),
  C("frozen-peas", "frozen peas", "frozen", "status", { aliases: ["peas"] }),
  C("salt", "salt", "spices", "status", { aliases: ["kosher salt"] }),
  C("black-pepper", "black pepper", "spices", "status", { aliases: ["pepper"] }),
  C("cumin", "cumin", "spices", "status", { aliases: ["ground cumin"] }),
  C("chili-powder", "chili powder", "spices", "status"),
  C("paprika", "paprika", "spices", "status", { aliases: ["smoked paprika"] }),
  C("oregano", "oregano", "spices", "status", { aliases: ["dried oregano", "italian seasoning"] }),
  C("cinnamon", "cinnamon", "spices", "status", { aliases: ["ground cinnamon"] }),
  C("red-pepper-flakes", "red pepper flakes", "spices", "status", { aliases: ["chili flakes"] }),
];

const BY_KEY = new Map(CATALOG.map((c) => [c.key, c]));
const WORDS = new Map<string, string>();
for (const c of CATALOG) for (const w of [c.key.replace(/-/g, " "), c.name, c.noun, ...(c.aliases ?? [])]) if (w) WORDS.set(w.toLowerCase(), c.key);

export const catalogItem = (key: string) => BY_KEY.get(key);

const clean = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 '-]/g, " ").replace(/\b(the|some|a|an|of|our|my|more|any|last|fresh)\b/g, " ").replace(/\s+/g, " ").trim();

function singular(w: string) {
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (w.endsWith("es") && /(ch|sh|x|s)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Maps whatever someone said ("the last of the EVOO", "a can of tomatoes") to a catalog key, or a tidy free-text key. */
export function resolveItem(said: string): { key: string; known: boolean; name: string } {
  const raw = said.toLowerCase().trim().replace(/^(a|an|the|some|our|my)\s+/, "");
  const cleaned = clean(raw);
  for (const candidate of [raw, cleaned, singular(cleaned), cleaned.replace(/^(can|cans|box|bag|bottle|jar|carton|bunch|loaf|pack|package) /, "")]) {
    const key = WORDS.get(candidate) ?? WORDS.get(singular(candidate));
    if (key) return { key, known: true, name: BY_KEY.get(key)!.name };
  }
  const name = cleaned || raw;
  return { key: `x-${name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item"}`, known: false, name };
}

export const AISLE_ORDER: Aisle[] = ["produce", "meat", "dairy", "bakery", "pantry", "spices", "frozen"];
