# Friction log

Real friction from building Larder for the Amazon Developer Hackathon "Build, Ship, Shape" (Alexa+ track), Oct 19, 2026.

1. MCP protocol version: had to verify which spec version `mcp-handler` negotiates; added an automated check (expects 2025-11-25).
2. MCP Apps: no reference web host; wrote a minimal one to render and test the card.
3. Vercel connector deploy: inline multi-file deploy hit our tool's per-call file reference limit; switched to per-file upload plus SHA manifest.
4. OpenRouter free tier: turn latency from about 2 to about 25 seconds in one session; some turns fell back to the offline planner (visible in the demo).
5. Next.js 16 dev server: a second dev server in the same project directory is refused, which slowed switching between model and offline test modes.
6. Web Speech API: no events when synthesis never starts, which froze the UI state until fixed.
7. Piper voice licensing: the lessac voice's dataset is research-only; switched to the public domain LJ Speech voice.
8. Playwright video recording needed a separate ffmpeg download; we captured frames through the Chrome DevTools screencast instead.

