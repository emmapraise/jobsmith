import type { NextConfig } from "next";

const securityHeaders = [
  // TLS only: browsers will refuse plain HTTP for two years.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Privacy: dev-mode server-function logging prints action ARGUMENTS (resume content). Never log those.
  logging: { serverFunctions: false },
  serverExternalPackages: ["postgres", "mammoth", "unpdf", "pdfkit", "docx"],
  // The PDF renderer reads these font files at runtime; make sure they ship with the server bundle.
  outputFileTracingIncludes: { "/**": ["./node_modules/dejavu-fonts-ttf/ttf/*.ttf", "./node_modules/pdfkit/js/data/*"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
