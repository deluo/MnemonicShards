import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { renameSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// 产物使用具有明确功能含义的英文命名，便于长期归档识别
const OUTPUT_NAME = 'mnemonic-shards-offline';
const CHECKSUM_FILE = 'SHA256SUMS.txt';

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

/**
 * 构建完成后自动生成 GNU 格式校验文件 dist/SHA256SUMS.txt
 * （<sha256>  <文件名>，与 sha256sum/shasum -c 直接兼容）。
 * 哈希不再手工誊写到文档，校验文件与产物同源生成、随仓库与发布附件分发；
 * 内容幂等：哈希未变时不重写文件，保证构建可复现
 */
function checksumPlugin() {
  return {
    name: 'generate-sha256sums',
    closeBundle() {
      const outDir = fileURLToPath(new URL('./dist', import.meta.url));
      const artifact = resolve(outDir, `${OUTPUT_NAME}.html`);
      if (!existsSync(artifact)) return;

      const hash = createHash('sha256').update(readFileSync(artifact)).digest('hex');
      const line = `${hash}  ${OUTPUT_NAME}.html\n`;
      const sumsPath = resolve(outDir, CHECKSUM_FILE);
      if (!existsSync(sumsPath) || readFileSync(sumsPath, 'utf8') !== line) {
        writeFileSync(sumsPath, line);
      }
    },
  };
}

export default defineConfig({
  base: './', // 相对路径：file:// 双击打开或任意静态服务器均可运行
  plugins: [viteSingleFile(), renameOutputPlugin(), checksumPlugin()],
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
