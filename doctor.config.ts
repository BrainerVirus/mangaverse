import type { ReactDoctorConfig } from 'react-doctor/api';

// Any finding fails the scan: the CI hard gate lands once the arc's findings are fixed.
const config = {
  blocking: 'warning',
  plugins: ['./lint/team-conventions.cjs'],
  rules: {
    'team-conventions/no-use-effect': 'error',
  },
} satisfies ReactDoctorConfig;

export default config;
