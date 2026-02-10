const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 1. Tell Next.js to enforce TypeScript errors during production builds
  typescript: {
    ignoreBuildErrors: false,
  },

  // 2. Tell Next.js to enforce ESLint errors during production builds
  eslint: {
    ignoreDuringBuilds: false,
  },

  // 3. Keep your existing API and Storage rewrites
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE_URL}/api/:path*`,
      },
      {
        source: "/storage/:path*",
        destination: `${API_BASE_URL}/storage/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
