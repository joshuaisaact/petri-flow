import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/nets/safe-coding.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
