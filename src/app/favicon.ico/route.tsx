import { renderIcon } from "@/lib/pwa-icon";

// Browsers request /favicon.ico by default. Serve the real icon bytes (PNG is fine for favicons); a redirect or an
// empty response would give a blank favicon on some hosts.
export const dynamic = "force-static";

export function GET() {
  return renderIcon("32")!;
}
