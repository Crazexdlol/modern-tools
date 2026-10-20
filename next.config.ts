import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "pdf-lib", "imapflow", "mailparser"],
  productionBrowserSourceMaps: false,
  // Vercel's serverless bundler (nft) only ships files it can trace from
  // source. AcroForm PDF templates in public/ are traced because their exact
  // filenames appear in the fs.readFileSync string literals. public/logo.png
  // is read the same way (see src/lib/storage/pdf.ts) but was still absent
  // from the serverless bundle in prod — force-include it here so the
  // Storage Charge Report actually shows the letterhead.
  outputFileTracingIncludes: {
    "/api/storage/generate-pdf": ["./public/logo.png"],
  },
};

export default nextConfig;
