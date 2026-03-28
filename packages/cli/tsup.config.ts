import { defineConfig } from "tsup";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

export default defineConfig({
  entry: {
    "bin/tokenscore": "bin/tokenscore.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  clean: true,
  sourcemap: true,
  target: "node20",
  external: ["@tokenscore/core", "better-sqlite3"],
  onSuccess: async () => {
    // Add shebang to the bin entry only
    const binPath = resolve("dist/bin/tokenscore.js");
    const content = readFileSync(binPath, "utf-8");
    if (!content.startsWith("#!")) {
      writeFileSync(binPath, `#!/usr/bin/env node\n${content}`);
    }
  },
});
