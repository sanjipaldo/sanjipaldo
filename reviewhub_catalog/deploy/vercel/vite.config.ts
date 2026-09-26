// Vercel 함수용 서버 번들: apps/server 빌드 설정과 같은 별칭으로 하나의 ESM 파일로 묶습니다.
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vite";

const root = path.resolve(__dirname, "../..");
// entry.ts는 apps/server 밖에 있어 pnpm 패키지를 직접 찾지 못하므로 서버 패키지 기준으로 경로를 풀어 둡니다.
const serverRequire = createRequire(path.join(root, "apps/server/package.json"));
const honoNodeVercel = serverRequire.resolve("@hono/node-server/vercel").replace(/vercel\.js$/, "vercel.mjs");

const blobStorage = path.join(__dirname, "blob-storage.ts");

export default defineConfig({
  root: path.join(root, "apps/server"),
  plugins: [
    {
      // 서버 코드의 Skywork 파일 저장소(s3_storage)를 Vercel Blob 모듈로 바꿔 끼웁니다.
      name: "doogo-vercel-blob-storage",
      enforce: "pre",
      resolveId(source) {
        return /(^|\/)s3_storage(\.ts)?$/.test(source) ? blobStorage : null;
      }
    }
  ],
  ssr: { noExternal: true },
  resolve: {
    alias: [
      { find: /^@hono\/node-server\/vercel$/, replacement: honoNodeVercel },
      { find: /^@libsql\/client$/, replacement: "@libsql/client/web" },
      { find: /^@repo\/shared\/http$/, replacement: path.join(root, "packages/shared/src/http.ts") },
      { find: /^@repo\/shared$/, replacement: path.join(root, "packages/shared/src/index.ts") }
    ]
  },
  build: {
    ssr: path.join(__dirname, "entry.ts"),
    outDir: path.join(root, ".vercel-server"),
    emptyOutDir: true,
    target: "node20",
    rollupOptions: { output: { format: "es", entryFileNames: "handler.mjs", inlineDynamicImports: true } }
  }
});
