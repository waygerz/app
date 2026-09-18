// eslint.config.mjs — native flat config (eslint-config-next 16 ships flat
// configs, so no FlatCompat / @eslint/eslintrc shim is needed).
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Same file scope as next's config object that registers these plugins.
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      // Disable react-in-jsx-scope (not needed in React 17+)
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',
      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler rules new in eslint-plugin-react-hooks v7 (pulled in by
      // eslint-config-next 16). Existing code predates them — surfaced as
      // warnings until the violations are cleaned up, then promote to 'error'.
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'prisma/**', 'next-env.d.ts']),
]);

export default eslintConfig;
