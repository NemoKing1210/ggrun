import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Tree-shake barrel exports from icon/animation libs → smaller client bundle.
    optimizePackageImports: ["@heroicons/react", "framer-motion", "react-easy-crop"],
    // React Compiler auto-memoizes client components → faster hydration/render.
    reactCompiler: true,
    // The profile editor submits its cropped images through a server action;
    // two images plus the form fields can exceed the 1 MB default.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
