import { defineConfig, UserConfig, ConfigEnv, Plugin } from 'vite';
import path from 'path';

const live2dStaticCache = (): Plugin => ({
  name: 'live2d-static-cache',
  enforce: 'pre',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?', 1)[0] ?? '';
      if (/^\/(Resources|Core)\//.test(pathname)) {
        const setHeader = response.setHeader.bind(response);
        response.setHeader = ((name: string, value: string | number | readonly string[]) => {
          if (name.toLowerCase() === 'cache-control') {
            return setHeader(name, 'public, max-age=86400, stale-while-revalidate=604800');
          }
          return setHeader(name, value);
        }) as typeof response.setHeader;
        response.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      }
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?', 1)[0] ?? '';
      if (/^\/(Resources|Core)\//.test(pathname)) {
        response.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      }
      next();
    });
  },
});

export default defineConfig((env: ConfigEnv): UserConfig => {
  let common: UserConfig = {
    plugins: [live2dStaticCache()],
    server: {
      port: 5000,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
        },
      },
    },
    root: './',
    base: '/',
    publicDir: './public',
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@framework': path.resolve(__dirname, './vendor/Framework/src'),
      }
    },
    build: {
      target: 'baseline-widely-available',
      assetsDir: 'assets',
      outDir: './dist',
      sourcemap: env.mode == 'development' ? true : false,
    },
  };
  return common;
});
