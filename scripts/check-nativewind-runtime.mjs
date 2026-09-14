#!/usr/bin/env node
// Guards against a split NativeWind runtime on iOS/Android.
//
// When a frontend dependency change alters the peer set of react-native-css-interop or nativewind, pnpm links
// them under a new `node_modules/.pnpm/<name>@<version>_<peer-hash>` directory but can leave the old one on
// disk. A Metro server that was not restarted with `--clear` may keep resolving app code to the stale copy
// while the compiled Tailwind stylesheet registers into the new one, and every className style silently
// disappears on native (web still looks right because it uses real CSS). This happened on 2026-09-14.
//
// Usage: node scripts/check-nativewind-runtime.mjs [--fix]
//   without --fix: report orphaned copies and exit 1 if any exist
//   with --fix:    delete orphaned copies (never referenced by pnpm-lock.yaml) and always exit 0
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const virtualStore = join(root, "node_modules", ".pnpm");
const lockfile = join(root, "pnpm-lock.yaml");
const packages = ["react-native-css-interop", "nativewind"];
const fix = process.argv.includes("--fix");

function main() {
  if (!existsSync(virtualStore) || !existsSync(lockfile)) return 0;

  const lock = readFileSync(lockfile, "utf8");
  const referenced = new Set();
  for (const match of lock.matchAll(/(react-native-css-interop|nativewind)@([\w.-]+)\(([0-9a-f]{32})\)/g)) {
    referenced.add(`${match[1]}@${match[2]}_${match[3]}`);
  }
  for (const match of lock.matchAll(/^ {2}(react-native-css-interop|nativewind)@([\w.-]+):$/gm)) {
    referenced.add(`${match[1]}@${match[2]}`);
  }

  const installed = readdirSync(virtualStore).filter((entry) => packages.some((name) => entry.startsWith(`${name}@`)));
  const orphans = installed.filter((entry) => !referenced.has(entry));
  const liveInterop = installed.filter((entry) => entry.startsWith("react-native-css-interop@") && referenced.has(entry));

  if (liveInterop.length > 1) {
    console.warn(`[nativewind] pnpm-lock.yaml resolves ${liveInterop.length} copies of react-native-css-interop:\n  ${liveInterop.join("\n  ")}\n` +
      "[nativewind] Different packages may style against different runtimes on native. Align their peer dependencies.");
  }

  if (!orphans.length) {
    if (!fix) console.log("[nativewind] OK: one NativeWind runtime, no stale copies.");
    return liveInterop.length > 1 && !fix ? 1 : 0;
  }

  if (!fix) {
    console.error(`[nativewind] Stale copies not referenced by pnpm-lock.yaml:\n  ${orphans.join("\n  ")}\n` +
      "[nativewind] Run `pnpm check:nativewind --fix`, then restart Metro with `pnpm --filter @lenadena/frontend exec expo start --clear`.");
    return 1;
  }

  for (const entry of orphans) rmSync(join(virtualStore, entry), { recursive: true, force: true });
  console.warn(`[nativewind] Removed ${orphans.length} stale NativeWind/css-interop cop${orphans.length === 1 ? "y" : "ies"}: ${orphans.join(", ")}\n` +
    "[nativewind] Restart Metro with `pnpm --filter @lenadena/frontend exec expo start --clear` before testing on a device or simulator.");
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.warn(`[nativewind] Runtime check skipped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = fix ? 0 : 1;
}
