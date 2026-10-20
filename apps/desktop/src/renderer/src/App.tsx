import { RouterProvider } from '@tanstack/react-router';
import { getRouter } from '@app/web/router';
import { detectDesktopCapabilities } from './bootstrap.js';

const router = getRouter({ platformDetectFn: detectDesktopCapabilities });

export function App() {
  return <RouterProvider router={router} />;
}
