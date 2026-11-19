## 安装

1. 下载下方的 `Clipboard.Viewer-0.1.0-uTools.zip` 并解压
2. 打开 uTools → 插件应用市场右上角「开发者工具」→ **打开项目**
3. 选择解压目录里的 `plugin.json`

安装后在搜索框输入 `剪贴板解析` / `剪贴板查看` / `clipboard` 唤起。

## 说明

- 剪贴板读写走 preload 桥接的 Electron `clipboard`，支持纯文本、HTML、RTF、图片与剪贴板中的文件路径
- 「环境检查」模式已移除；唤起插件不会自动读取，需点「直接读取」或按 Ctrl+V
- 另存为走系统保存对话框
- 仅支持 uTools，不提供网页版与桌面端

## 解压后的目录

```
plugin.json     uTools 插件配置
index.html      插件页面
preload.js      剪贴板桥接
package.json    {"type":"commonjs"}，勿删
logo.png        插件图标
assets/         前端资源
```
