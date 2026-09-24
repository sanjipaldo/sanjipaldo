// 미리보기 전용 빌드 설정: BrowserRouter를 HashRouter로 바꿔 단일 HTML 파일에서도 페이지 이동이 되게 합니다.
import path from "path";
import { createRequire } from "module";
import base from "../../apps/client/vite.config";

export default async (env: Parameters<Extract<typeof base, (...args: never[]) => unknown>>[0]) => {
  const cfg = typeof base === "function" ? await base(env) : base;
  const alias = cfg.resolve!.alias as Record<string, string>;
  alias["react-router-dom-original"] = path.resolve(__dirname, "router.tsx");
  // 원본 react-router-dom ESM 파일을 절대 경로로 지정해야 scripts/ 아래 파일에서도 해석됩니다.
  const clientRequire = createRequire(path.resolve(__dirname, "../../apps/client/package.json"));
  const rrdDir = path.dirname(clientRequire.resolve("react-router-dom/package.json"));
  alias["react-router-dom-real"] = path.join(rrdDir, "dist/index.js");
  cfg.root = path.resolve(__dirname, "../../apps/client");
  cfg.build = { ...(cfg.build ?? {}), outDir: path.resolve(__dirname, "../../.preview-build"), emptyOutDir: true };
  return cfg;
};
