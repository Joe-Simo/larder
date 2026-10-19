import { createMcpHandler } from "mcp-handler";
import { INSTRUCTIONS, SERVER_INFO, registerLarder } from "@/lib/mcp-server";

export const maxDuration = 30;

/**
 * Larder's MCP endpoint (Streamable HTTP, stateless). Serves MCP 2025-11-25 clients, and the
 * 2026-07-28 revision natively. Pick a household with ?household=<id>; the default is the shared demo kitchen.
 */
const handler = createMcpHandler(registerLarder, { serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });

export { handler as GET, handler as POST, handler as DELETE };
