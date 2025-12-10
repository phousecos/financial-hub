import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Prevent 307 redirects for trailing slashes - needed for QBWC SOAP endpoint
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
