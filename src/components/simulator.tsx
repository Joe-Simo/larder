"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardHost } from "./card-host";

type Call = { name: string; arguments: Record<string, unknown>; ok: boolean; ms: number };
type TurnResult = {
  speech: string;
  plan: { source: "model" | "offline" | "cache"; model: string | null; note: string | null };
  calls: Call[];
  card: { uri: string | null; tool: string; result: Record<string, unknown> } | null;
  cardHtml?: string;
  confirmation_code: string | null;
  mcp: { protocolVersion: string | null; transport: string };
  ms: number;
};
type Turn = { id: number; user: string; via: "voice" | "text" | "tap"; member: string; result?: TurnResult; error?: string };
type Snapshot = {
  pantry: { key: string; name: string; level: "stocked" | "low" | "out"; count?: number; onOrder?: boolean }[];
  cart: { key: string; name: string; qty?: number }[];
  pending: { code: string; lines: number } | null;
  activity: { at: string; who?: string; text: string }[];
};

const MEMBERS = ["Maya", "Sam", "Alex"];
const STARTERS = ["We're out of eggs and low on olive oil", "What can I make tonight?", "Make lasagna for six on Saturday", "Do we have onions?"];
type Ring = "idle" | "listen" | "think" | "speak";

function newHouseholdId() {
  const a = new Uint8Array(5);
  crypto.getRandomValues(a);
  return `k-${Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8)}`;
}

type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function Simulator() {
  const [household, setHousehold] = useState<string | null>(null);
  const [member, setMember] = useState(MEMBERS[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [ring, setRing] = useState<Ring>("idle");
  const [voiceOn, setVoiceOn] = useState(true);
  const [cardHtml, setCardHtml] = useState<string | null>(null);
  const [card, setCard] = useState<Record<string, unknown> | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [srOk, setSrOk] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const recog = useRef<SR | null>(null);
  const idRef = useRef(0);
  const busy = ring === "think";
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id = localStorage.getItem("larder-household");
    if (!id || !/^k-[a-z0-9]{6,10}$/.test(id)) {
      id = newHouseholdId();
      localStorage.setItem("larder-household", id);
    }
    setHousehold(id);
    setOrigin(window.location.origin);
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setSrOk(!!(W.SpeechRecognition ?? W.webkitSpeechRecognition));
  }, []);

  const refresh = useCallback(async (id: string) => {
    const r = await fetch(`/api/household?household=${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setSnap(await r.json());
  }, []);
  useEffect(() => {
    if (household) refresh(household);
  }, [household, refresh]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const speak = useCallback(
    (text: string) => {
      if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return setRing("idle");
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1.03;
      u.onstart = () => setRing("speak");
      u.onend = () => setRing("idle");
      u.onerror = () => setRing("idle");
      window.speechSynthesis.speak(u);
    },
    [voiceOn],
  );

  const history = useMemo(
    () => turns.filter((t) => t.result).slice(-3).map((t) => ({ user: t.user, speech: t.result!.speech, tools: t.result!.calls.map((c) => c.name), confirmation_code: t.result!.confirmation_code })),
    [turns],
  );

  const send = useCallback(
    async (text: string, via: Turn["via"] = "text") => {
      const utterance = text.trim();
      if (!utterance || !household || busy) return;
      const id = ++idRef.current;
      setTurns((t) => [...t, { id, user: utterance, via, member }]);
      setInput("");
      setRing("think");
      try {
        const res = await fetch("/api/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ utterance, household, member, history, wantCard: !cardHtml }) });
        const data = (await res.json()) as TurnResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Larder didn't answer. Try again.");
        if (data.cardHtml) setCardHtml(data.cardHtml);
        if (data.card) setCard(data.card.result);
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, result: data } : x)));
        setRing("idle");
        speak(data.speech);
        refresh(household);
      } catch (err) {
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: err instanceof Error ? err.message : "Something went wrong." } : x)));
        setRing("idle");
      }
    },
    [household, member, history, cardHtml, busy, speak, refresh],
  );

  const toolCall = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const res = await fetch("/api/tool", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ household, member, name, arguments: args }) });
      const data = (await res.json()) as { speech: string; structuredContent: Record<string, unknown> | null; isError: boolean };
      const id = ++idRef.current;
      const label = name === "cart_add" ? "Tapped: add to cart" : name === "order_place" ? "Tapped: review order" : name === "order_confirm" ? "Tapped: place order" : name === "order_received" ? "Tapped: it arrived" : `Tapped: ${name}`;
      setTurns((t) => [...t, { id, user: label, via: "tap", member, result: { speech: data.speech, plan: { source: "offline", model: null, note: null }, calls: [{ name, arguments: args, ok: !data.isError, ms: 0 }], card: data.structuredContent ? { uri: null, tool: name, result: data.structuredContent } : null, confirmation_code: (data.structuredContent?.confirmation_code as string | null) ?? null, mcp: { protocolVersion: null, transport: "streamable-http" }, ms: 0 } }]);
      if (data.structuredContent) setCard(data.structuredContent);
      speak(data.speech);
      if (household) refresh(household);
      return data;
    },
    [household, member, speak, refresh],
  );

  const listen = useCallback(() => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor || busy) return;
    if (recog.current) {
      recog.current.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) finalText = text;
    };
    r.onend = () => {
      recog.current = null;
      setRing((x) => (x === "listen" ? "idle" : x));
      if (finalText) send(finalText, "voice");
    };
    r.onerror = () => {
      recog.current = null;
      setRing("idle");
    };
    recog.current = r;
    setRing("listen");
    r.start();
  }, [busy, send]);

  const reset = async () => {
    if (!household) return;
    window.speechSynthesis?.cancel();
    const r = await fetch("/api/household", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ household, action: "reset" }) });
    if (r.ok) setSnap(await r.json());
    setTurns([]);
    setCard(null);
  };

  const last = [...turns].reverse().find((t) => t.result)?.result;
  const suggestions = (() => {
    if (!last) return STARTERS;
    if (last.confirmation_code) return ["Yes, place it", "No, wait"];
    if (/add (it|them) to your cart/i.test(last.speech)) return ["Yes, add them", "What can I make tonight?"];
    if (last.calls.some((c) => c.name === "order_confirm" && c.ok)) return ["The groceries are here", "What changed in the kitchen?"];
    if (last.calls.some((c) => c.name === "cart_add")) return ["Place the order", "Make lasagna for six on Saturday", "What's in my cart?"];
    if (last.calls.some((c) => c.name === "order_received")) return ["What can I make tonight?", "What changed in the kitchen?"];
    return STARTERS;
  })();

  const mcpUrl = household && origin ? `${origin}/api/mcp?household=${household}` : "";
  const low = snap?.pantry.filter((p) => p.level !== "stocked" || p.onOrder) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Device */}
      <section aria-label="Simulated Alexa+ device" className="flex flex-col gap-4">
        <div className="rounded-[28px] border border-line bg-[#0a0e0c] p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[18px] bg-[#0f1512]">
            {cardHtml && card ? (
              <CardHost html={cardHtml} result={card} onToolCall={toolCall} onMessage={(t) => send(t, "tap")} />
            ) : (
              <div className="flex h-full flex-col justify-center px-8">
                <p className="text-sm uppercase tracking-[0.18em] text-mute">Kitchen</p>
                <p className="mt-2 max-w-md text-2xl font-semibold leading-tight text-ink sm:text-3xl">{busy ? "Thinking..." : "Tell me what happened in the kitchen, or ask what's for dinner."}</p>
                <p className="mt-3 text-sm text-mute">Cards from Larder&apos;s MCP server appear here, like on an Echo Show.</p>
              </div>
            )}
          </div>
          <div className="mx-auto mt-3 h-1.5 w-40 rounded-full transition-colors" aria-hidden>
            <div className={`h-full w-full rounded-full ring-${ring}`} />
          </div>
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {srOk && (
            <button type="button" onClick={listen} disabled={busy} aria-label={ring === "listen" ? "Stop listening" : "Speak to Larder"} className={`grid size-12 shrink-0 place-items-center rounded-full border transition ${ring === "listen" ? "border-ring bg-ring text-[#06202e]" : "border-line bg-panel text-ink hover:bg-panel-2"} disabled:opacity-50`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
          )}
          <label htmlFor="say" className="sr-only">Say something to Larder</label>
          <input id="say" value={input} onChange={(e) => setInput(e.target.value)} placeholder={ring === "listen" ? "Listening..." : "Try: we're out of eggs"} maxLength={300} autoComplete="off" className="h-12 min-w-0 flex-1 rounded-full border border-line bg-panel px-5 text-base text-ink placeholder:text-mute focus:border-[#3b5446] focus:outline-none" />
          <button type="submit" disabled={busy || !input.trim()} className="h-12 shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-[#0d1210] transition hover:bg-white disabled:opacity-40">Send</button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy} className="rounded-full border border-line bg-panel px-3.5 py-2 text-sm text-ink transition hover:bg-panel-2 disabled:opacity-50">{s}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-mute">
          <div className="flex items-center gap-2" role="radiogroup" aria-label="Who is speaking">
            <span>Speaking as</span>
            {MEMBERS.map((m) => (
              <button key={m} role="radio" aria-checked={member === m} onClick={() => setMember(m)} className={`rounded-full px-3 py-1.5 transition ${member === m ? "bg-panel-2 text-ink ring-1 ring-[#3b5446]" : "hover:text-ink"}`}>{m}</button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={voiceOn} onChange={(e) => { setVoiceOn(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} className="accent-[#7fd49b]" />
            Voice replies
          </label>
        </div>
      </section>

      {/* Conversation, state, connect */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="rounded-2xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Conversation</h2>
            <span className="text-xs text-mute">Each turn calls Larder over MCP</span>
          </div>
          <div ref={log} className="max-h-[360px] min-h-[160px] space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {!turns.length && <p className="text-sm text-mute">Nothing yet. Tap a suggestion, type, or use the mic. Your kitchen is private to this browser and remembered between visits.</p>}
            {turns.map((t) => (
              <div key={t.id} className="space-y-1.5">
                <p className="text-sm"><span className="text-mute">{t.member}{t.via === "voice" ? " (voice)" : ""}:</span> {t.user}</p>
                {t.result && (
                  <>
                    <p className="text-[15px] leading-snug text-ink"><span className="mr-1.5 inline-block size-2 rounded-full bg-ring align-middle" aria-hidden /> {t.result.speech}</p>
                    <details className="group text-xs text-mute">
                      <summary className="cursor-pointer list-none select-none hover:text-ink">
                        {t.via === "tap" ? "From the card" : t.result.plan.source === "offline" ? "Planned by the offline matcher" : `Planned by ${t.result.plan.model?.split("/")[1]?.replace(":free", "") ?? "open model"}${t.result.plan.source === "cache" ? " (cached)" : ""}`}
                        {" · "}
                        {t.result.calls.map((c) => c.name).join(", ") || "no tool"}
                        {t.result.ms ? ` · ${(t.result.ms / 1000).toFixed(1)} s` : ""}
                      </summary>
                      <div className="mt-2 space-y-1.5 rounded-lg bg-[#0f1512] p-2.5 font-mono text-[11px] leading-relaxed">
                        {t.result.plan.note && <p className="font-sans text-warn">{t.result.plan.note}</p>}
                        {t.result.calls.map((c, i) => (
                          <p key={i} className="break-words"><span className={c.ok ? "text-ok" : "text-bad"}>tools/call</span> {c.name} {JSON.stringify(c.arguments)}{c.ms ? ` ${c.ms} ms` : ""}</p>
                        ))}
                        {t.result.mcp.protocolVersion && <p className="text-mute">MCP {t.result.mcp.protocolVersion} over Streamable HTTP</p>}
                      </div>
                    </details>
                  </>
                )}
                {t.error && <p className="text-sm text-bad">{t.error}</p>}
                {!t.result && !t.error && <p className="text-sm text-mute">...</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">This kitchen, remembered</h2>
            <button onClick={reset} className="text-xs text-mute underline-offset-2 hover:text-ink hover:underline">Reset kitchen</button>
          </div>
          <div className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wider text-mute">Low, out, or on order</h3>
              {!snap ? <p className="text-mute">Loading...</p> : low.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {low.map((p) => (
                    <span key={p.key} className={`rounded-full border px-2.5 py-1 text-xs ${p.onOrder ? "border-[#22465a] text-ring" : p.level === "out" ? "border-[#5a2c27] text-bad" : "border-[#5b4a22] text-warn"}`}>{p.name}{p.onOrder ? ", on order" : p.level === "out" ? ", out" : ", low"}</span>
                  ))}
                </div>
              ) : <p className="text-mute">Everything is stocked.</p>}
              <h3 className="mb-2 mt-4 text-xs uppercase tracking-wider text-mute">Cart</h3>
              {snap?.cart.length ? <p>{snap.cart.map((c) => c.name).join(", ")}</p> : <p className="text-mute">Empty</p>}
            </div>
            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wider text-mute">Family activity</h3>
              <ul className="space-y-1.5">
                {(snap?.activity ?? []).slice(0, 5).map((a, i) => (
                  <li key={i} className="leading-snug"><span className="text-ring">{a.who ?? "Larder"}</span> <span className="text-ink/90">{a.text}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel px-4 py-4 text-sm">
          <h2 className="font-semibold">Connect your own MCP client</h2>
          <p className="mt-1 text-mute">Same server, same kitchen. Works with any client that speaks Streamable HTTP (Claude, Cursor, MCP Inspector).</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-[#0f1512] px-3 py-2 font-mono text-xs">{mcpUrl || "..."}</code>
            <button onClick={async () => { await navigator.clipboard.writeText(mcpUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} disabled={!mcpUrl} className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs hover:bg-panel-2">{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
