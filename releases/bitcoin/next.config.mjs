import { fileURLToPath } from 'node:url';
export default {
  output: 'standalone',
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  poweredByHeader: false,
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
        },
      ],
    },
  ],
};
