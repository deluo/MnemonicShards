import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: '/MnemonicShards/',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
    cssCodeSplit: false,
    assetsInlineLimit: 100000000, // 确保所有资源都被内联
  },
  optimizeDeps: {
    include: ['shamir-secret-sharing'],
  },
});
