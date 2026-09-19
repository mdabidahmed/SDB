import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    devSourcemap: true,
    modules: {
      // Readable class names in dev, hashed in prod.
      generateScopedName:
        process.env.NODE_ENV === 'production' ? '[hash:base64:6]' : '[name]__[local]__[hash:base64:4]',
    },
  },
  json: {
    // `book.json` is multi-megabyte; parsing a JSON string is far faster than
    // evaluating a giant object literal, and it keeps the chunk small.
    stringify: true,
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    // The book payload is inherently large; this silences the size warning for
    // the data chunk only after we have already split it out of the app bundle.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/data/')) return 'book-data';
          if (id.includes('/node_modules/react-router')) return 'router';
          if (id.includes('/node_modules/react-dom') || id.includes('/node_modules/react/')) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
