import type { MetadataRoute } from "next";

/** Web app manifest: makes Jobsmith installable ("Add to Home Screen"). Colours match the design tokens. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Jobsmith",
    short_name: "Jobsmith",
    description: "Tailor your resume truthfully to each job, track applications, and follow up on time.",
    // Opens straight into the app; signed-out users are sent to sign-in and brought back.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9f4",
    theme_color: "#005e5e",
    lang: "en",
    categories: ["productivity", "business"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Applications", short_name: "Tracker", url: "/tracker", icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }] },
      { name: "Tailor to a job", short_name: "Tailor", url: "/tailor", icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }] },
      { name: "My resume", short_name: "Resume", url: "/resume", icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
