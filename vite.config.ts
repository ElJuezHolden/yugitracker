import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // En GitHub Pages la web vive en /yugitracker/; en local, en la raíz.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    watch: {
      // La copia de seguridad en archivo se puede guardar en la carpeta del
      // proyecto. Si Vite la vigila, cada guardado recarga la página, y la
      // página al cargar vuelve a guardarla: la web parpadea sin parar.
      ignored: ['**/yugitracker-coleccion*.json', '**/public/precios/**'],
    },
  },
  build: {
    // Las imágenes de las cartas son remotas; el bundle propio debe ser pequeño.
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
});
