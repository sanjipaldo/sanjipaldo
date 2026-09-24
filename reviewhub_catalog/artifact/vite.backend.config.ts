// 페이지 안에서 도는 서버 번들 빌드. apps/server 코드는 그대로 쓰고 DB·파일저장 모듈만 브라우저용으로 바꿉니다.
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const here = __dirname;
const serverDir = path.resolve(here, "../apps/server");
const swaps: Record<string, string> = {
  [path.join(serverDir, "_core/db.ts")]: path.join(here, "src/browser-db.ts"),
  [path.join(serverDir, "services/s3_storage.ts")]: path.join(here, "src/browser-storage.ts")
};

function artifactResolver(): Plugin {
  return {
    name: "doogo-artifact-resolver",
    enforce: "pre",
    load(id) {
      if (id !== "\0doogo-sqljs-wasm") return null;
      const wasm = fs.readFileSync(path.join(here, "node_modules/sql.js/dist/sql-wasm.wasm"));
      return `export default ${JSON.stringify(wasm.toString("base64"))};`;
    },
    async resolveId(source, importer, options) {
      if (source === "virtual:sqljs-wasm") return "\0doogo-sqljs-wasm";
      if (!importer) return null;
      if (source.startsWith(".")) {
        const base = path.resolve(path.dirname(importer), source);
        for (const candidate of [base, `${base}.ts`]) if (swaps[candidate]) return swaps[candidate];
        return null;
      }
      // artifact/src 파일의 패키지 import는 apps/server 기준으로 찾습니다(pnpm은 루트에 올리지 않음).
      if (importer.startsWith(path.join(here, "src")) && !source.startsWith("sql.js") && !source.startsWith("/")) {
        const resolved = await this.resolve(source, path.join(serverDir, "_core/create-app.ts"), { ...options, skipSelf: true });
        if (resolved) return resolved;
      }
      return null;
    }
  };
}

export default defineConfig({
  plugins: [artifactResolver()],
  define: { "process.env": "{}", "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: {
    alias: [
      { find: /^@repo\/shared\/http$/, replacement: path.resolve(here, "../packages/shared/src/http.ts") },
      { find: /^@repo\/shared$/, replacement: path.resolve(here, "../packages/shared/src/index.ts") }
    ]
  },
  build: {
    outDir: path.resolve(here, "../.artifact-build/backend"),
    emptyOutDir: true,
    target: "es2020",
    assetsInlineLimit: 100_000_000,
    minify: true,
    lib: { entry: path.resolve(here, "src/backend.ts"), formats: ["es"], fileName: () => "backend.js" },
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
