import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Tree-shake barrel exports from icon/animation libs → smaller client bundle.
    optimizePackageImports: ["@heroicons/react", "framer-motion", "react-easy-crop"],
    // React Compiler auto-memoizes client components → faster hydration/render.
    reactCompiler: true,
  },
};

export default nextConfig;
