import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function adminRouteRedirectPlugin() {
  const redirectAdminRoute = (req: {url?: string}, res: {statusCode?: number; setHeader: (name: string, value: string) => void; end: () => void}, next: () => void) => {
    if (req.url === '/admin') {
      res.statusCode = 302;
      res.setHeader('Location', '/admin/');
      res.end();
      return;
    }

    next();
  };

  return {
    name: 'admin-route-redirect',
    configureServer(server: {middlewares: {use: (handler: typeof redirectAdminRoute) => void}}) {
      server.middlewares.use(redirectAdminRoute);
    },
    configurePreviewServer(server: {middlewares: {use: (handler: typeof redirectAdminRoute) => void}}) {
      server.middlewares.use(redirectAdminRoute);
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), adminRouteRedirectPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
