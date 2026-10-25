import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // 真实的 obsidian 包只有类型声明、没有运行时入口，测试时换成替身
      obsidian: `${root}test/stubs/obsidian.ts`,
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
  },
});
