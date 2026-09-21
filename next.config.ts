import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages는 정적 호스팅이라 정적 파일로 내보낸다.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // 배포 시 워크플로가 BASE_PATH=/Trip-Planner 를 넣는다. 로컬은 빈 값.
  basePath: process.env.BASE_PATH ?? "",
};

export default nextConfig;
