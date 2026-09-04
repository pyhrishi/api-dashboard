/** @type {import('next').NextConfig} */
const nextConfig = {
  // Verification builds set NEXT_DIST_DIR=.next-verify so `next build` never overwrites
  // the running dev server's `.next` (which would 404 all assets and blank the app).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
