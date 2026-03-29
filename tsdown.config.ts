import { defineConfig } from "tsdown";
import { copyFileSync, mkdirSync } from "node:fs";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  onSuccess: () => {
    mkdirSync("dist", { recursive: true });
    copyFileSync("src/server/wheel.html", "dist/wheel.html");
  },
});
