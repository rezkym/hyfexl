import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      '.venv/**',
      'venv/**',
      '**/.venv/**',
      '**/venv/**',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
];

export default config;
