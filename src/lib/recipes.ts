/**
 * Larder's starter cookbook: twelve everyday dinners and breakfasts, written for this project.
 * Quantities are for `serves` people. Counted items (eggs, onions) use a whole number of that item;
 * everything else carries a kitchen measure that scales with the servings.
 */
export interface Ingredient {
  item: string;
  qty: number;
  /** Kitchen measure for non-counted items, e.g. "cup", "tbsp". Omitted for counted items. */
  measure?: string;
  /** Salt, pepper, oil: assumed on hand unless the pantry says it is out. */
  staple?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  serves: number;
  minutes: number;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
}

const I = (item: string, qty: number, measure?: string, staple?: boolean): Ingredient => ({ item, qty, ...(measure ? { measure } : {}), ...(staple ? { staple } : {}) });

export const RECIPES: Recipe[] = [
  {
    id: "weeknight-lasagna", name: "Weeknight lasagna", serves: 4, minutes: 75, tags: ["dinner", "crowd", "make-ahead"],
    ingredients: [I("lasagna-noodles", 0.5, "box"), I("ground-beef", 0.5, "lb"), I("crushed-tomatoes", 1), I("ricotta", 1, "cup"), I("mozzarella", 1.5, "cups"), I("parmesan", 0.25, "cup"), I("eggs", 1), I("onions", 1), I("garlic", 2, "cloves"), I("oregano", 1, "tsp", true), I("olive-oil", 1, "tbsp", true), I("salt", 1, "tsp", true)],
    steps: ["Brown the beef with the chopped onion and garlic, then stir in the tomatoes and oregano and simmer 10 minutes.", "Mix the ricotta with the egg and half the parmesan.", "Layer sauce, noodles, ricotta mix and mozzarella twice, ending with sauce, mozzarella and parmesan.", "Cover with foil and bake at 375 F for 40 minutes, then uncover for 10 more. Rest 10 minutes before cutting."],
  },
  {
    id: "veggie-fried-rice", name: "Veggie fried rice", serves: 4, minutes: 20, tags: ["dinner", "quick", "vegetarian", "leftovers"],
    ingredients: [I("rice", 3, "cups cooked"), I("eggs", 3), I("frozen-peas", 1, "cup"), I("carrots", 2), I("scallions", 4, "stalks"), I("garlic", 2, "cloves"), I("soy-sauce", 3, "tbsp"), I("vegetable-oil", 2, "tbsp", true)],
    steps: ["Scramble the eggs in a hot oiled pan and set aside.", "Stir-fry diced carrots and garlic for 3 minutes, then add the peas.", "Add the cold rice and press it into the pan until it crisps a little.", "Stir in soy sauce, the eggs and sliced scallions."],
  },
  {
    id: "chicken-tacos", name: "Chicken tacos", serves: 4, minutes: 30, tags: ["dinner", "family", "quick"],
    ingredients: [I("chicken-breast", 2), I("tortillas", 8), I("limes", 1), I("avocados", 1), I("cilantro", 0.25, "cup"), I("onions", 1), I("cheddar", 1, "cup"), I("chili-powder", 2, "tsp", true), I("cumin", 1, "tsp", true), I("vegetable-oil", 1, "tbsp", true), I("salt", 1, "tsp", true)],
    steps: ["Rub the chicken with chili powder, cumin and salt, then sear 6 to 7 minutes a side until cooked through.", "Rest, slice, and squeeze lime over it.", "Warm the tortillas and fill with chicken, diced onion, avocado, cheese and cilantro."],
  },
  {
    id: "shakshuka", name: "Shakshuka", serves: 2, minutes: 25, tags: ["breakfast", "dinner", "vegetarian", "one-pan"],
    ingredients: [I("eggs", 4), I("crushed-tomatoes", 1), I("onions", 1), I("bell-peppers", 1), I("garlic", 2, "cloves"), I("cumin", 1, "tsp", true), I("paprika", 1, "tsp", true), I("olive-oil", 2, "tbsp", true), I("bread", 4, "slices")],
    steps: ["Soften the onion and pepper in olive oil, then add garlic, cumin and paprika.", "Pour in the tomatoes and simmer until thick, about 10 minutes.", "Make wells, crack in the eggs, cover and cook until the whites set.", "Serve with toasted bread."],
  },
  {
    id: "fluffy-pancakes", name: "Fluffy pancakes", serves: 4, minutes: 20, tags: ["breakfast", "family"],
    ingredients: [I("flour", 1.5, "cups"), I("milk", 1.25, "cups"), I("eggs", 1), I("butter", 3, "tbsp"), I("sugar", 1, "tbsp"), I("baking-powder", 3.5, "tsp"), I("maple-syrup", 0.5, "cup"), I("salt", 0.5, "tsp", true)],
    steps: ["Whisk flour, sugar, baking powder and salt.", "Add milk, egg and melted butter and stir until just combined.", "Cook quarter-cup scoops on a buttered griddle until bubbles form, then flip.", "Serve with maple syrup."],
  },
  {
    id: "tomato-basil-pasta", name: "Tomato basil pasta", serves: 4, minutes: 25, tags: ["dinner", "quick", "vegetarian"],
    ingredients: [I("pasta", 1, "lb"), I("crushed-tomatoes", 1), I("garlic", 3, "cloves"), I("basil", 0.5, "cup"), I("parmesan", 0.5, "cup"), I("red-pepper-flakes", 0.5, "tsp", true), I("olive-oil", 3, "tbsp", true), I("salt", 1, "tsp", true)],
    steps: ["Boil the pasta in well-salted water.", "Warm sliced garlic and pepper flakes in olive oil, then add the tomatoes and simmer 10 minutes.", "Toss the pasta with the sauce, torn basil and parmesan, loosening with pasta water."],
  },
  {
    id: "black-bean-quesadillas", name: "Black bean quesadillas", serves: 4, minutes: 20, tags: ["dinner", "quick", "vegetarian", "family"],
    ingredients: [I("tortillas", 8), I("black-beans", 1), I("cheddar", 2, "cups"), I("bell-peppers", 1), I("onions", 1), I("sour-cream", 0.5, "cup"), I("cumin", 1, "tsp", true), I("vegetable-oil", 1, "tbsp", true)],
    steps: ["Saute the diced pepper and onion with cumin, then stir in the drained beans and mash a little.", "Fill tortillas with beans and cheese and fold.", "Crisp in a pan 2 to 3 minutes a side and serve with sour cream."],
  },
  {
    id: "lemon-garlic-salmon", name: "Lemon garlic salmon", serves: 2, minutes: 20, tags: ["dinner", "quick", "healthy"],
    ingredients: [I("salmon", 2), I("lemons", 1), I("garlic", 2, "cloves"), I("butter", 2, "tbsp"), I("broccoli", 1, "head"), I("olive-oil", 1, "tbsp", true), I("salt", 0.5, "tsp", true), I("black-pepper", 0.25, "tsp", true)],
    steps: ["Roast the broccoli with oil and salt at 425 F for 10 minutes.", "Add the salmon to the pan, top with garlic butter and lemon slices.", "Roast 10 to 12 minutes more, until the salmon flakes."],
  },
  {
    id: "chicken-noodle-soup", name: "Chicken noodle soup", serves: 6, minutes: 45, tags: ["dinner", "comfort", "make-ahead"],
    ingredients: [I("chicken-breast", 2), I("chicken-broth", 8, "cups"), I("egg-noodles", 3, "cups"), I("carrots", 3), I("celery", 3, "stalks"), I("onions", 1), I("garlic", 2, "cloves"), I("olive-oil", 1, "tbsp", true), I("salt", 1, "tsp", true), I("black-pepper", 0.5, "tsp", true)],
    steps: ["Soften the onion, carrots and celery in oil, then add garlic.", "Add the broth and whole chicken breasts and simmer 20 minutes.", "Shred the chicken, return it to the pot with the noodles and cook until tender."],
  },
  {
    id: "grilled-cheese-tomato-soup", name: "Grilled cheese and tomato soup", serves: 2, minutes: 15, tags: ["lunch", "dinner", "quick", "family", "comfort"],
    ingredients: [I("bread", 4, "slices"), I("cheddar", 1, "cup"), I("butter", 2, "tbsp"), I("tomato-soup", 1)],
    steps: ["Heat the soup.", "Butter the bread, fill with cheddar and grill until golden on both sides.", "Cut and serve with the soup."],
  },
  {
    id: "spinach-cheddar-omelet", name: "Spinach cheddar omelet", serves: 1, minutes: 10, tags: ["breakfast", "quick", "vegetarian"],
    ingredients: [I("eggs", 3), I("spinach", 1, "cup"), I("cheddar", 0.25, "cup"), I("butter", 1, "tbsp"), I("salt", 0.25, "tsp", true)],
    steps: ["Wilt the spinach in butter.", "Pour in the beaten, salted eggs and stir gently until almost set.", "Add the cheese, fold, and slide onto a plate."],
  },
  {
    id: "weeknight-chili", name: "Weeknight chili", serves: 6, minutes: 50, tags: ["dinner", "crowd", "make-ahead", "comfort"],
    ingredients: [I("ground-beef", 1, "lb"), I("kidney-beans", 2), I("crushed-tomatoes", 1), I("onions", 1), I("bell-peppers", 1), I("garlic", 3, "cloves"), I("chili-powder", 2, "tbsp", true), I("cumin", 2, "tsp", true), I("cheddar", 1, "cup"), I("sour-cream", 0.5, "cup"), I("salt", 1, "tsp", true)],
    steps: ["Brown the beef with onion, pepper and garlic.", "Stir in chili powder and cumin, then the tomatoes and drained beans.", "Simmer 30 minutes and serve with cheddar and sour cream."],
  },
];

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id);

/** Finds a recipe from what someone said: "lasagna", "the salmon one", "pancakes". */
export function findRecipe(said: string): Recipe | undefined {
  const q = said.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\b(the|a|an|one|recipe|some|make|for)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return undefined;
  const exact = RECIPES.find((r) => r.id === q.replace(/ /g, "-") || r.name.toLowerCase() === q);
  if (exact) return exact;
  const words = q.split(" ").filter((w) => w.length > 2).map((w) => w.replace(/s$/, ""));
  let best: { r: Recipe; score: number } | undefined;
  for (const r of RECIPES) {
    const hay = `${r.name} ${r.id}`.toLowerCase();
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { r, score };
  }
  return best?.r;
}
