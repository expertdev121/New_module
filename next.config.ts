
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizeCss: false, // <- MUST BE SET!
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL', // Allow embedding in iframes
          },
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
