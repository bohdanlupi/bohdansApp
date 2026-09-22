import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // react-pdf ships its own font/layout engine; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF routes read the logo from disk at runtime.
  outputFileTracingIncludes: {
    "/api/pdf/**": ["./public/brand/**"],
  },
};

export default withNextIntl(nextConfig);
