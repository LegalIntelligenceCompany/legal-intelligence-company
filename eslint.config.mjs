import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", ".next-check/**", "work/**", "node_modules/**", "pnpm-lock.yaml", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
);
