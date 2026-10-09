import { redirect } from "next/navigation";

// Browsers ask for /favicon.ico by default; serve the brand icon instead of a generic one.
export function GET() {
  redirect("/pwa-icon/32");
}
