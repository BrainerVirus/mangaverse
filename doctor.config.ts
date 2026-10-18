import type { ReactDoctorConfig } from 'react-doctor/api';

// Any finding fails the scan: CI runs this as a hard gate.
const config = {
  blocking: 'warning',
  // Build artifacts bundle dependencies; scanning them flags code we do not own.
  ignore: {
    files: ['**/.output/**', '**/dist/**'],
  },
  plugins: ['./lint/team-conventions.cjs'],
  rules: {
    'team-conventions/no-use-effect': 'error',
  },
} satisfies ReactDoctorConfig;

export default config;
