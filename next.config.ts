import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// 기본 경로(src/i18n/request.ts)의 요청 설정을 사용한다
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
