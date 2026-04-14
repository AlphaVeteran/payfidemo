import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 仓库根目录与 frontend/ 各有一份 package-lock 时，Next 会警告并可能错误推断根路径，
 * 运行期偶发找不到 webpack chunk（如 Cannot find module './331.js'）。固定为 monorepo 根目录。
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
