// Vercel 서버리스 함수 진입점: 기존 Hono 앱(apps/server)을 그대로 Node 함수로 감쌉니다.
import { handle } from "@hono/node-server/vercel";
import app from "../../apps/server/_core/create-app";

export default handle(app);
