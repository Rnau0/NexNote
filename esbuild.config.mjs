import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner = `/*
NexNote — MIT License, Copyright (c) ${new Date().getFullYear()} Rnau0
本文件由 esbuild 从 src/ 打包生成，请勿手工修改；源码见 https://github.com/Rnau0/NexNote
*/`;

const production = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: production,
  platform: "browser",
});

if (production) {
  await context.rebuild();
  await context.dispose();
  process.exit(0);
} else {
  await context.watch();
  console.log("[NexNote] 监听中：修改 src/ 下的文件会自动重新打包 main.js");
}
