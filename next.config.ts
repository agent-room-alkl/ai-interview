import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse / pdfjs-dist out of the server bundle so their worker file
  // (pdf.worker.mjs) resolves from node_modules at runtime instead of a missing
  // .next chunk ("Setting up fake worker failed").
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
