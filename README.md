# Clipboard Viewer · uTools

一个基于 React + TypeScript 的剪贴板查看器。

## 基于项目

📦 **原项目**: [Seeridia/clipboard-viewer](https://github.com/Seeridia/clipboard-viewer)

本项目 fork 自原项目。原项目是「网页版为主 + Tauri v2 桌面壳」，本仓库在其基础上改造为 **uTools 插件应用**


## 技术栈

- **前端**: React + TypeScript + Vite
- **UI**: Tailwind CSS
- **运行环境**: uTools（Electron） + preload 桥接，浏览器预览时使用 Web Clipboard API
- **状态管理**: Zustand

## 快速开始

### 环境要求

使用 Node.js 24 LTS。

### 安装依赖

```bash
npm ci
```

### 开发

```bash
npm run dev
```

> `npm run dev` 下没有 preload，剪贴板能力会自动使用浏览器的 Web Clipboard API，因此读取、写入、另存为在 `localhost` 下都可正常使用（首次读取浏览器会弹权限请求）。RTF 写入仅 uTools 支持。

### 构建

```bash
npm run build
```

构建产物 `dist/` 本身就是一个完整的 uTools 插件目录。

### 安装到 uTools

1. uTools → **插件应用** → **开发者工具** → **打开项目**，选择 `dist/plugin.json`
2. 唤起关键词：`剪贴板解析` / `剪贴板查看` / `clipboard`

## 功能特性

- ✨ 多格式数据查看（纯文本、HTML、RTF、图片、文件）
- 📋 图片预览（位图转 PNG 展示，带缩略图）
- 🔍 历史记录抽屉，查看本次会话的解析记录
- 📥 唤起时不自动读取，点「直接读取」或按 Ctrl+V 触发
- 📤 写入模式支持纯文本 / HTML / RTF 三种格式
- 💾 结果可复制、另存为（uTools 中走系统保存对话框，浏览器中走下载）
- 🌐 开发预览可用：无 preload 时自动使用到 Web Clipboard API
- 🎨 现代化 UI 设计，沿用原项目视觉

## 项目结构

```
├── public/
│   ├── plugin.json      # uTools 插件配置（main / logo / preload / features）
│   ├── preload.js       # 桥接层：Electron clipboard + uTools API
│   └── package.json     # {"type":"commonjs"}，见下方注意事项
├── src/                 # React 前端
│   ├── components/      # 组件
│   ├── pages/           # 页面
│   ├── store/           # 状态管理
│   ├── types/           # 类型定义
│   └── utils/           # 工具函数
├── dist/                # 构建输出，即插件目录
└── .github/workflows/   # CI：lint + build，产物 dist 作为 artifact
```

## 开发命令

```bash
npm run dev             # 前端开发服务器
npm run build           # 构建插件
npm run lint            # 代码检查
npm run check           # TypeScript 类型检查
npm run preview         # 预览构建产物
```


## 注意事项

- **`dist/package.json` 不能删**：项目根是 `"type": "module"`，uTools 用 `require()` 加载 preload，Node 会顺着目录找到该声明并按 ES Module 执行，报 `require is not defined`。`public/package.json` 里的 `{"type":"commonjs"}` 用来覆盖作用域。
- **路由必须是 `HashRouter`**：插件页面通过 `file://` 加载，`BrowserRouter` 的 location 会变成磁盘路径导致匹配失败。
- **`base` 必须是 `'./'`**：`vite.config.ts` 里改成 `/` 会让 `assets/` 找不到。

## 与原项目的差异

| 项 | 原项目 | 本项目 |
| --- | --- | --- |
| 运行形态 | 网页版 + Tauri v2 桌面端 | uTools 插件（浏览器仅作开发预览） |
| 剪贴板读写 | Web API（`navigator.clipboard` 等） | preload 桥接优先，浏览器使用 Web API |
| 另存为 | `<a download>` | 系统保存对话框（浏览器使用下载） |
| 路由 | `BrowserRouter` | `HashRouter`（`file://` 需要） |
| 环境检查模式 | 有 | 已移除 |
| 构建目标 | `dist/` 网页产物 | `dist/` 即插件目录 |
