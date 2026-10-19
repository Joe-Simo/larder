# Larder

**The kitchen memory Alexa+ is missing.** Larder is a self-hosted MCP server that gives a voice assistant a shared, persistent memory of a household's kitchen. One spoken sentence like "we're out of eggs" or "six people for lasagna Saturday" becomes an updated pantry, a scaled recipe, and a grocery order that waits for your yes.

Built for the Alexa+ track of the Amazon Developer Hackathon "Build, Ship, Shape" (2026). Not made by or affiliated with Amazon.

- **Live demo (simulated Alexa+ in the browser):** LIVE_URL
- **MCP endpoint:** `LIVE_URL/api/mcp` (Streamable HTTP, MCP 2025-11-25; the 2026-07-28 revision is also served)

## Why

Alexa's shopping list is a flat list. It does not know what is already in the kitchen, what a recipe needs, or the gap between the two. The kitchen is where hands are busy and a voice assistant already sits, so it is the place people will say "we just used the last of the milk" out loud but will not open an app to log it. Larder keeps that memory for the whole household, across conversations.

## What it does

1. **Pantry memory by voice.** "We're out of eggs and low on olive oil." Larder records both, remembers who said it, and offers to add them to the cart.
2. **What can I make, and for how many.** Recipes are ranked by what is already on hand. "Make lasagna for six" scales the recipe and lists exactly what is short ("1 more can of crushed tomatoes") or missing.
3. **Cart and confirmed checkout.** Missing items go to the cart. `order_place` returns a summary and a confirmation code; nothing is ordered until `order_confirm` after a clear yes. When the groceries arrive, `order_received` restocks the pantry.
4. **Family activity.** "What changed in the kitchen?" reads the shared log: who used up what, what went in the cart, what was ordered.

Orders are simulated. There is no store and no payment.

## MCP tools

Every tool returns `structuredContent` (with an `outputSchema`) and a `speech` field written to be read aloud, carries tool annotations, and links the MCP Apps card `ui://larder/kitchen-card.html`.

| Tool | What it does | Annotations |
| --- | --- | --- |
| `pantry_update` | bought, used_some, used_up, running_low, forget; several changes per call | write |
| `pantry_check` | "do we have eggs?", or a summary of what is low and out | read-only |
| `recipes_suggest` | recipes ranked by what is on hand, as a carousel | read-only |
| `recipe_plan` | scale one recipe, compare with the pantry, return steps | write (remembers the plan), idempotent |
| `cart_add` | add named items, or only what a recipe is missing | write |
| `cart_remove` / `cart_view` | edit or read the cart | destructive, idempotent / read-only |
| `order_place` | step 1 of purchasing: review plus a confirmation code (15 minutes) | write |
| `order_confirm` | step 2: place the order only with the matching code | write |
| `order_received` | restock the pantry from the delivered order | write |
| `kitchen_recap` | the household's shared activity log | read-only |

Also: one prompt, `weekly_restock`, and server `instructions` that tell the assistant to speak `speech` and to ask before confirming an order.

**MCP Apps.** The card is a single self-contained HTML view (`text/html;profile=mcp-app`). It completes the `ui/initialize` handshake, renders whichever result arrives in `ui/notifications/tool-result` (pantry chips, recipe carousel, recipe checklist, cart, order review, activity timeline), calls Larder tools back through the host with `tools/call` when you tap a button, and sends `ui/message` when you tap a recipe, so touch and voice share one flow.

**Households.** Each household's kitchen is chosen by the MCP URL: `/api/mcp?household=<id>` (or an `x-larder-household` header). The default is a shared demo kitchen. The speaker's first name can be passed as `member` (or `x-larder-member`) so the activity log shows who did what.

## Connect your own client

Any MCP client that speaks Streamable HTTP works. The demo page shows a private URL for your browser's kitchen.

```json
{ "mcpServers": { "larder": { "url": "LIVE_URL/api/mcp?household=my-kitchen" } } }
```

For stdio-only clients: `npx -y mcp-remote LIVE_URL/api/mcp`.

## The simulated Alexa+

The demo page stands in for Alexa+, because Alexa+ itself is not available to outside developers to test against:

- Speak (Chrome's Web Speech API) or type. Replies are spoken by your browser's speech synthesis.
- An open model on OpenRouter plans each utterance into Larder tool calls, reading the live `tools/list`. The page then calls Larder through the official MCP TypeScript client over Streamable HTTP, exactly as any MCP host would, and renders the MCP Apps card in an Echo Show style frame.
- The free model tier is small, so each visitor gets a few model-planned turns a day. After that, or if the model is slow, a small offline intent matcher plans the common kitchen phrases, and the page says which planner answered.

## Architecture

```
Browser (simulated Alexa+)                     Larder (Next.js on Vercel)
  mic / text -> /api/turn  ---- plan ---->  open model (OpenRouter) or offline matcher
                           ---- MCP client, Streamable HTTP ---->  /api/mcp  (MCP server)
  Echo Show frame <- ui://larder/kitchen-card.html (MCP Apps)        |
  card taps -> /api/tool -> tools/call ----------------------------->|
                                                                     v
                                                    household state (private Vercel Blob)
```

- `src/lib/mcp-server.ts`: tools, schemas, annotations, MCP Apps resource, prompt
- `src/lib/household.ts`: pantry, recipes, cart, and order logic (pure functions, voice copy)
- `src/lib/store.ts`: per-household persistence (private Vercel Blob, or local files)
- `src/lib/card-html.ts`: the MCP Apps view
- `src/lib/planner.ts`, `src/lib/llm.ts`: the simulator's planner and its fallback
- `src/components/card-host.tsx`: a minimal MCP Apps host

## Run it locally

```bash
pnpm install
cp .env.example .env.local   # all values optional
pnpm dev                     # http://localhost:3000, MCP at /api/mcp
pnpm test                    # unit tests plus MCP round trips over Streamable HTTP
pnpm typecheck && pnpm lint && pnpm build
```

Without `OPENROUTER_API_KEY` the simulator uses the offline matcher. Without `BLOB_READ_WRITE_TOKEN` households are stored in `.data/`.

## Limits, honestly

- Orders are simulated: no store, catalog prices, or payment.
- Twelve recipes, written for this project. The catalog knows 64 common items; anything else is tracked as free text without counts.
- No account linking. A household is whoever has its URL, which is fine for a demo and not for production (production would use Alexa account linking or OAuth).
- Concurrent writes to one household from different server instances are last-write-wins.

## AI disclosure

This project was written with AI coding assistance. The simulator uses an open model (via OpenRouter) to plan tool calls at runtime. The demo video narration uses a synthetic text-to-speech voice.

## License

MIT
