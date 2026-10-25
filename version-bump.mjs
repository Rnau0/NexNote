import { existsSync, readFileSync, writeFileSync } from "fs";

/**
 * 由 `npm version <patch|minor|major>` 触发：
 * 把 package.json 的新版本号写进 manifest.json 与 versions.json。
 */
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("[NexNote] 未从 npm_package_version 读取到版本号，请用 npm version 触发。");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versionsFile = "versions.json";
const versions = existsSync(versionsFile)
  ? JSON.parse(readFileSync(versionsFile, "utf8"))
  : {};
versions[targetVersion] = minAppVersion;
writeFileSync(versionsFile, JSON.stringify(versions, null, "\t") + "\n");

console.log(`[NexNote] 版本已更新：${targetVersion}（minAppVersion ${minAppVersion}）`);
