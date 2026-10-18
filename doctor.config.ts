import type { ReactDoctorConfig } from 'react-doctor/api';

// Any finding fails the scan: CI runs this as a hard gate.
const config = {
  blocking: 'warning',
  // Build artifacts bundle dependencies; scanning them flags code we do not own.
  ignore: {
    files: ['**/.output/**', '**/dist/**'],
    // The @shadcn/lint design-system rules are adopted from .oxlintrc.json. Their
    // measured backlog (counts in .oxlintrc.json) is a follow-up slice, so they
    // stay visible in `pnpm lint` but must not fail this gate yet.
    rules: [
      'shadcn/no-restyle',
      'shadcn/no-arbitrary-values',
      'shadcn/no-inline-styles',
      'shadcn/no-unknown-classes',
    ],
  },
  plugins: ['./lint/team-conventions.cjs'],
  rules: {
    'team-conventions/no-use-effect': 'error',
  },
} satisfies ReactDoctorConfig;

export default config;
