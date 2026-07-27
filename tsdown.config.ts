import { defineConfig } from "tsdown";

// The overlay HTML is inlined by scripts/gen-assets.mjs (see the `gen:assets`
// npm script) so both `dist/index.mjs` and the compiled executables are
// self-contained — no sibling .html files to ship.
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
});
