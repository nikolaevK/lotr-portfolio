/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // public/ is not in the deployed function's filesystem on Vercel, so the
  // audio-manifest readdir needs the MP3s traced into its bundle.
  outputFileTracingIncludes: {
    "/api/audio-manifest/route": ["./public/audio/**"],
  },
  async headers() {
    return [
      {
        source: "/:dir(assets|audio)/:path*",
        headers: [
          // not content-hashed, so revalidate after a day rather than immutable
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
