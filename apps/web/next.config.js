/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 1. Tell Next.js to ignore TypeScript errors during production builds
  typescript: {
    ignoreBuildErrors: true,
  },

  // 2. Tell Next.js to ignore ESLint errors during production builds
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 3. Keep your existing API and Storage rewrites
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/api/:path*",
      },
      {
        source: "/storage/:path*",
        destination: "http://localhost:4000/storage/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
