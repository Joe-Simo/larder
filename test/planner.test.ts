import { describe, expect, it } from "vitest";
import { planOffline } from "@/lib/planner";

const names = (u: string, history: Parameters<typeof planOffline>[1] = []) => planOffline(u, history, "Maya").calls;

describe("offline intent matcher", () => {
  it("splits several pantry changes in one sentence", () => {
    expect(names("Alexa, we're out of eggs and low on olive oil")[0]).toEqual({ name: "pantry_update", arguments: { changes: [{ item: "eggs", action: "used_up" }, { item: "olive oil", action: "running_low" }], member: "Maya" } });
    expect(names("I bought a dozen eggs")[0].arguments).toMatchObject({ changes: [{ item: "eggs", action: "bought", count: 12 }] });
  });
  it("plans a recipe with servings", () => {
    expect(names("make lasagna for six on Saturday")[0]).toEqual({ name: "recipe_plan", arguments: { recipe: "lasagna", servings: 6 } });
  });
  it("only confirms an order when one is under review", () => {
    const review = [{ user: "place the order", speech: "Your order has 2 items. Should I place it?", tools: ["order_place"], confirmation_code: "olive-123" }];
    expect(names("yes, place it", review)[0]).toEqual({ name: "order_confirm", arguments: { confirmation_code: "olive-123", member: "Maya" } });
    expect(names("yes, place it").map((c) => c.name)).not.toContain("order_confirm");
  });
  it("adds what was offered after a pantry update", () => {
    const offer = [{ user: "out of eggs", speech: "Got it: eggs are out, and olive oil is running low. Want me to add them to your cart?", tools: ["pantry_update"] }];
    expect(names("yes", offer)[0]).toEqual({ name: "cart_add", arguments: { items: [{ item: "eggs" }, { item: "olive oil" }], member: "Maya" } });
  });
  it("answers off-topic requests without tools", () => {
    const p = planOffline("what's the weather", [], undefined);
    expect(p.calls).toEqual([]);
    expect(p.say).toMatch(/kitchen/);
  });
});
