import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 构建产物 dist 即 uTools 插件应用目录，plugin.json / preload.js / logo.png 由 public 目录原样拷贝
export default defineConfig({
  // uTools 以本地文件方式加载插件界面，资源必须使用相对路径
  base: './',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'chrome132',
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    react(),
  ],
})
