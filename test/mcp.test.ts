import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { connectLarder } from "@/lib/mcp-client";

/** Real MCP over Streamable HTTP against the route handler (no network): the same client the simulator uses. */
const fetchToRoute = (async (input: RequestInfo | URL, init?: RequestInit) => POST(new Request(input, init))) as typeof fetch;

describe("Larder MCP server", () => {
  it("negotiates 2025-11-25 and lists tools that link the MCP Apps card", async () => {
    const c = await connectLarder("http://larder.test", "t-mcp-list", undefined, fetchToRoute);
    expect(c.protocolVersion).toBe("2025-11-25");
    const tools = await c.tools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["pantry_update", "pantry_check", "recipes_suggest", "recipe_plan", "cart_add", "order_place", "order_confirm", "kitchen_recap"]));
    expect(tools.every((t) => t.uiResource === "ui://larder/kitchen-card.html")).toBe(true);
    const html = await c.readResource("ui://larder/kitchen-card.html");
    expect(html).toContain("ui/notifications/tool-result");
    await c.close();
  });

  it("keeps one household's kitchen across separate connections", async () => {
    const id = `t-mcp-${Date.now().toString(36)}`;
    const a = await connectLarder("http://larder.test", id, "Maya", fetchToRoute);
    const r = await a.call("pantry_update", { changes: [{ item: "milk", action: "used_up" }] });
    expect(r.ok).toBe(true);
    expect(r.structured).toMatchObject({ kind: "pantry_update", household: id });
    await a.close();
    const b = await connectLarder("http://larder.test", id, "Sam", fetchToRoute);
    const check = await b.call("pantry_check", { items: ["milk"] });
    expect(check.speech).toBe("You're out of milk.");
    const recap = await b.call("kitchen_recap", {});
    expect(recap.speech).toContain("Maya");
    await b.close();
  });

  it("rejects bad input with a tool error, not a crash", async () => {
    const c = await connectLarder("http://larder.test", "t-mcp-bad", undefined, fetchToRoute);
    const r = await c.call("pantry_update", { changes: [] });
    expect(r.ok).toBe(false);
    await c.close();
  });
});
