import { describe, expect, it } from "vitest";
import { addToCart, checkPantry, confirmOrder, fmtQty, newHousehold, placeOrder, planRecipe, receiveOrder, recap, suggestRecipes, updatePantry } from "@/lib/household";
import { resolveItem } from "@/lib/catalog";

describe("catalog", () => {
  it("maps everyday words to one item", () => {
    expect(resolveItem("the EVOO").key).toBe("olive-oil");
    expect(resolveItem("a can of tomatoes").key).toBe("crushed-tomatoes");
    expect(resolveItem("Eggs").key).toBe("eggs");
    expect(resolveItem("green onions").key).toBe("scallions");
    expect(resolveItem("dragon fruit")).toMatchObject({ known: false, key: "x-dragon-fruit" });
  });
});

describe("pantry", () => {
  it("records used up, low, and bought, and offers to add to the cart", () => {
    const h = newHousehold("t-pantry");
    const r = updatePantry(h, [{ item: "eggs", action: "used_up" }, { item: "olive oil", action: "running_low" }], "Maya");
    expect(r.speech).toBe("Got it: eggs are out, and olive oil is running low. Want me to add them to your cart?");
    expect(h.pantry.eggs).toMatchObject({ level: "out", count: 0, updatedBy: "Maya" });
    updatePantry(h, [{ item: "eggs", action: "bought", count: 12 }]);
    expect(h.pantry.eggs).toMatchObject({ level: "stocked", count: 12 });
    updatePantry(h, [{ item: "eggs", action: "used_some", count: 11 }]);
    expect(h.pantry.eggs).toMatchObject({ level: "low", count: 1 });
    expect(checkPantry(h, ["eggs"]).speech).toBe("You have 1 egg, running low.");
  });
});

describe("recipes", () => {
  it("scales a recipe and finds the gaps against the pantry", () => {
    const h = newHousehold("t-plan");
    const r = planRecipe(h, "lasagna", 6);
    expect(r.recipe?.servings).toBe(6);
    const tomatoes = r.recipe!.needs.find((n) => n.key === "crushed-tomatoes")!;
    expect(tomatoes).toMatchObject({ status: "short", buy: 1, amount: "2 cans of crushed tomatoes" });
    expect(r.recipe!.needs.find((n) => n.key === "ricotta")).toMatchObject({ status: "missing", amount: "1 1/2 cups ricotta" });
    expect(r.recipe!.needs.find((n) => n.key === "eggs")).toMatchObject({ status: "have" });
    expect(h.lastPlan).toEqual({ recipe: "weeknight-lasagna", servings: 6 });
  });
  it("ranks what you can make now first", () => {
    const top = suggestRecipes(newHousehold("t-sug")).recipes[0];
    expect(top.missing).toEqual([]);
  });
  it("uses kitchen fractions", () => {
    expect([0.75, 2.25, 1.5, 0.1, 3].map(fmtQty)).toEqual(["3/4", "2 1/4", "1 1/2", "1/8", "3"]);
  });
});

describe("purchasing", () => {
  it("never orders without the matching confirmation, then restocks on delivery", () => {
    const h = newHousehold("t-order");
    planRecipe(h, "lasagna", 6);
    const cart = addToCart(h, {}, "Sam");
    expect(cart.added).toContain("ricotta");
    const review = placeOrder(h);
    expect(review.confirmation_code).toMatch(/^[a-z]+-\d{3}$/);
    expect(h.orders).toHaveLength(0);
    expect(confirmOrder(h, "wrong-000").ok).toBe(false);
    expect(h.orders).toHaveLength(0);
    const placed = confirmOrder(h, review.confirmation_code!, "Sam");
    expect(placed.ok).toBe(true);
    expect(h.cart).toHaveLength(0);
    expect(confirmOrder(h, review.confirmation_code!).ok).toBe(false);
    receiveOrder(h, "Sam");
    expect(h.pantry.ricotta.level).toBe("stocked");
    expect(h.pantry["crushed-tomatoes"].count).toBe(2);
    expect(recap(h).activity.map((a) => a.who)).toContain("Sam");
  });
  it("expires an order review", () => {
    const h = newHousehold("t-exp");
    addToCart(h, { items: [{ item: "milk" }] });
    const review = placeOrder(h);
    h.pending!.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(confirmOrder(h, review.confirmation_code!).ok).toBe(false);
    expect(h.pending).toBeUndefined();
  });
});
