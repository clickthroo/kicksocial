import type { NextConfig } from "next";

const config: NextConfig = {
  images: {
    // Shirt photography is served from Kickio's storage and its scrape sources.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default config;
