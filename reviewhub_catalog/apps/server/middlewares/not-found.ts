import type { NotFoundHandler } from "hono";
import { apiFailure } from "@repo/shared/http";

// 없는 API 주소로 요청이 오면 어떤 요청이었는지(방식·경로)를 안내와 서버 로그에 함께 남깁니다.
export const notFound: NotFoundHandler = (c) => {
  const target = `${c.req.method} ${new URL(c.req.url).pathname}`;
  console.warn(`[not-found] ${target}`);
  return c.json(apiFailure("NOT_FOUND", `요청한 기능을 찾을 수 없습니다. (${target})`), 404);
};
