/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizeCcs: false, // <- MUST BE SET!
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *;", // Allow all origins to embed this site
          },
        ],
      },
    ];
  },
};

export default nextConfig;