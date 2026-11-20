import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 产物使用具有明确功能含义的英文命名，便于长期归档识别
const OUTPUT_NAME = 'mnemonic-shards-offline';

/**
 * 构建完成后将 dist/index.html 重命名为 mnemonic-shards-offline.html
 * vite 对 HTML 入口始终按源文件名输出，只能在产物落盘后重命名
 */
function renameOutputPlugin() {
  return {
    name: 'rename-html-output',
    closeBundle() {
      const outDir = fileURLToPath(new URL('./dist', import.meta.url));
      const from = resolve(outDir, 'index.html');
      const to = resolve(outDir, `${OUTPUT_NAME}.html`);
      if (existsSync(from)) {
        renameSync(from, to);
      }
    },
  };
}

export default defineConfig({
  base: './', // 相对路径：file:// 双击打开或任意静态服务器均可运行
  plugins: [viteSingleFile(), renameOutputPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        [OUTPUT_NAME]: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
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
