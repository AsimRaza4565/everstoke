/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    root: '.',
  },
  // lib/data.mjs reads brands.json at runtime — make sure it ships in the
  // serverless bundle when this deploys to Vercel.
  outputFileTracingIncludes: {
    '/api/overview': ['./lib/brands.json'],
    '/api/action': ['./lib/brands.json'],
    '/api/thumbs/preview': ['./lib/fonts/**'],
  },
  async redirects() {
    // #103 — /keys retired; key operations live inline on /channels now.
    return [{ source: '/keys', destination: '/channels', permanent: true }];
  },
};

export default nextConfig;
