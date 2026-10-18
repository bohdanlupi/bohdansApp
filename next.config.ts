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
  // Honorarofferten and Honorarrechnungen moved under Debitoren.
  async redirects() {
    return [
      { source: "/honorarofferten", destination: "/debitoren", permanent: true },
      { source: "/honorarofferten/:path*", destination: "/debitoren/offerten/:path*", permanent: true },
      { source: "/honorarrechnungen/:path*", destination: "/debitoren/rechnungen/:path*", permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      // The address import sends up to 10'000 CSV rows in one action (Vercel caps bodies at 4.5 MB).
      bodySizeLimit: "4mb",
    },
  },
};

export default withNextIntl(nextConfig);
