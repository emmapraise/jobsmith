import { ICON_SIZES, renderIcon } from "@/lib/pwa-icon";

// Generated once at build time, so the home-screen icon always matches the brand.
export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(ICON_SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  return renderIcon(size) ?? new Response("Not found", { status: 404 });
}
