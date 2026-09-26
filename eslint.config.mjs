import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", ".next-check/**", ".next-final-check/**", ".pnpm-store/**", "work/**", "node_modules/**", "public/document-runtime/**", "pnpm-lock.yaml", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
);
