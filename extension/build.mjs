import * as esbuild from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "dist");

await mkdir(dist, { recursive: true });

const common = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  logLevel: "info",
};

await esbuild.build({
  ...common,
  entryPoints: [join(__dirname, "contentScript.ts")],
  outfile: join(dist, "contentScript.js"),
  format: "iife",
});

await esbuild.build({
  ...common,
  entryPoints: [join(__dirname, "background.ts")],
  outfile: join(dist, "background.js"),
  format: "iife",
});

console.log("extension/dist built.");
