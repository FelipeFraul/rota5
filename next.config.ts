import type { NextConfig } from "next";

const productionOrigin = "https://site-phi-seven-72.vercel.app";
const permissionsPolicy = [
  "accelerometer=()",
  "autoplay=()",
  "camera=(self)",
  "clipboard-write=(self)",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: permissionsPolicy,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: productionOrigin,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
