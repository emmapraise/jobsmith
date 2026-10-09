import { ImageResponse } from "next/og";

// Generated once at build time from the same mark as the in-app logo, so the home-screen icon always matches the brand.
export const dynamic = "force-static";

const BRAND = "#005e5e";
const BRAND_FG = "#f8fdfd";
const SPARK = "#ecce83";

const SIZES: Record<string, { px: number; kind: "rounded" | "full" }> = {
  "32": { px: 32, kind: "rounded" }, // favicon
  "180": { px: 180, kind: "full" }, // iOS applies its own mask, so no transparency
  "192": { px: 192, kind: "rounded" },
  "512": { px: 512, kind: "rounded" },
  "512-maskable": { px: 512, kind: "full" }, // Android masks it: keep the mark inside the 80% safe zone
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  const spec = SIZES[size];
  if (!spec) return new Response("Not found", { status: 404 });
  const { px, kind } = spec;
  const mark = kind === "full" ? 0.62 : 0.78; // share of the canvas the "J" box occupies
  const box = Math.round(px * mark);

  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", background: BRAND, borderRadius: kind === "rounded" ? Math.round(px * 0.22) : 0 }}>
        <svg width={box} height={box} viewBox="0 0 32 32">
          <path d="M11 9h11v3h-4.2v8.2c0 3-2 4.8-5 4.8-1.6 0-3-.5-4-1.4l1.6-2.5c.6.5 1.3.8 2 .8 1 0 1.6-.6 1.6-1.9V12H11V9Z" fill={BRAND_FG} />
          <circle cx="23.5" cy="8.5" r="1.9" fill={SPARK} />
        </svg>
      </div>
    ),
    { width: px, height: px, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
