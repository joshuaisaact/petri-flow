import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/nets/tool-approval.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
