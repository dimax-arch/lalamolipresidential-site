import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// base: './' keeps asset paths relative so the build works on GitHub Pages subpaths.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        reset: resolve(__dirname, 'reset-password.html'),
      },
    },
  },
});
