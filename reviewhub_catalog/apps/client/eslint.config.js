import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import noDirectApiRequest from "./eslint-rules/no-direct-api-request.js";

const local = {
  rules: {
    "no-direct-api-request": noDirectApiRequest
  }
};

export default tseslint.config(
  {
    ignores: ["dist/**", "dist-ssr/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      local
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "warn",
      "local/no-direct-api-request": "error"
    }
  },
  {
    files: ["eslint.config.js", "eslint-rules/**/*.js", "scripts/**/*.mjs", "vite.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    rules: {
      "no-empty": "off",
      "local/no-direct-api-request": "off"
    }
  },
  {
    // 서비스 워커(public/sw.js, 두고푸드 앱 2026-11-26): 앱 화면 코드가 아니라 브라우저가 따로 돌리는 파일이라 apiFetch를 쓸 수 없습니다.
    // API를 부르지 않고 화면 이동(navigate) 요청만 그대로 네트워크로 넘깁니다(인터넷이 끊기면 안내 화면).
    files: ["public/sw.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker
      }
    },
    rules: {
      "local/no-direct-api-request": "off"
    }
  }
);
