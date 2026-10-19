import { Simulator } from "@/components/simulator";

const REPO = "https://github.com/Joe-Simo/larder";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-8 sm:px-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-[#1d2a23] text-ok" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h16M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M5 10l1 10h12l1-10" /></svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Larder</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-mute">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href={REPO} className="hover:text-ink">GitHub</a>
        </nav>
      </header>

      <section className="mt-10 max-w-3xl">
        <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">The kitchen memory Alexa+ is missing.</h1>
        <p className="mt-4 text-lg leading-relaxed text-mute">
          Larder is a self-hosted MCP server that remembers what&apos;s in your kitchen, for the whole household. Say &ldquo;we&apos;re out of eggs&rdquo; or &ldquo;six people for lasagna Saturday&rdquo; and it updates the pantry, scales the recipe, and builds a grocery order you confirm out loud.
        </p>
      </section>

      <section className="mt-10" aria-label="Try Larder">
        <Simulator />
      </section>

      <section id="how" className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          { h: "One sentence, several tools", p: "The assistant plans each utterance into Larder tool calls over MCP: pantry_update, recipe_plan, cart_add, order_place. You hear one short reply." },
          { h: "Remembered across sessions", p: "Each household's pantry, cart, orders, and who-did-what live server-side, so Maya's \"we're out of milk\" this morning is in Sam's answer tonight." },
          { h: "Orders wait for your yes", p: "order_place returns a summary and a confirmation code. Nothing is ordered until order_confirm, after a clear yes. Orders here are simulated." },
        ].map((x) => (
          <div key={x.h} className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="font-semibold">{x.h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">{x.p}</p>
          </div>
        ))}
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-xs leading-relaxed text-mute">
        <p>
          This page simulates Alexa+ in the browser: an open model on OpenRouter plans each turn (with an offline matcher as fallback), your browser speaks the reply, and every action goes through Larder&apos;s MCP endpoint at <code className="font-mono">/api/mcp</code> (Streamable HTTP, MCP 2025-11-25). Larder is not made by or affiliated with Amazon. Orders are simulated: there is no store and no payment. Recipes are written for this project.
        </p>
      </footer>
    </main>
  );
}
