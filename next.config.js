/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // In development: proxy /api/* → FastAPI on :8000
  // In production (Vercel): requests hit Vercel routes → api/index.py serverless function
  // Do NOT use rewrites in production — vercel.json handles routing via its rewrite rules
  ...(process.env.NODE_ENV === "development"
    ? {
        rewrites: async () => [
          {
            source: "/api/:path*",
            destination: "http://127.0.0.1:8000/api/:path*",
          },
        ],
      }
    : {}),
};

module.exports = nextConfig;
