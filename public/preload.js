// uTools 剪贴板桥接层：以 Electron clipboard 读取/写入系统剪贴板
const fs = require("node:fs");
const path = require("node:path");
const { clipboard } = require("electron");

const IMAGE_MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

const MIME_BY_EXT = {
  ...IMAGE_MIME_BY_EXT,
  ".txt": "text/plain",
  ".md": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".json": "application/json",
  ".xml": "application/xml",
  ".rtf": "text/rtf",
  ".pdf": "application/pdf",
};

// Windows 下 readHTML 返回的是带 Version/StartHTML 头的 CF_HTML，截取正文
const stripCfHtml = (html) => {
  const start = html.search(/<html[\s>]/i);
  return start > 0 ? html.slice(start) : html;
};

const toDataUrl = (filePath, mimeType) =>
  `data:${mimeType};base64,${fs.readFileSync(filePath).toString("base64")}`;

// 剪贴板中的文件（资源管理器复制）-> 与前端 FileInfo 结构对齐
const readFileEntry = (filePath) => {
  const stat = fs.statSync(filePath);
  const mimeType = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "";
  return {
    mimeType: mimeType || "files",
    file: {
      name: path.basename(filePath),
      size: stat.size,
      type: mimeType,
      url: mimeType.startsWith("image/") ? toDataUrl(filePath, mimeType) : "",
      path: filePath,
      lastModified: stat.mtimeMs,
    },
  };
};

const read = () => {
  const entries = [];

  const text = clipboard.readText();
  const html = stripCfHtml(clipboard.readHTML() || "");
  const rtf = clipboard.readRTF();
  const image = clipboard.readImage();

  if (text) entries.push({ mimeType: "text/plain", text });
  if (html) entries.push({ mimeType: "text/html", text: html });
  if (rtf) entries.push({ mimeType: "text/rtf", text: rtf });

  if (!image.isEmpty()) {
    const png = image.toPNG();
    entries.push({
      mimeType: "image/png",
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      size: png.length,
    });
  }

  for (const file of utools.getCopiedFiles() || []) {
    try {
      entries.push(readFileEntry(file.path));
    } catch {
      // 文件已被移除时跳过
    }
  }

  return entries;
};

const write = (format, content) => {
  if (format === "text/html") clipboard.write({ html: content });
  else if (format === "text/rtf") clipboard.write({ rtf: content });
  else clipboard.write({ text: content });
  return true;
};

const saveFile = ({ name, text, dataUrl, sourcePath }) => {
  const targetPath = utools.showSaveDialog({
    title: "保存剪贴板内容",
    defaultPath: path.join(utools.getPath("downloads"), name),
    buttonLabel: "保存",
  });
  if (!targetPath) return false;

  if (sourcePath) fs.copyFileSync(sourcePath, targetPath);
  else if (dataUrl)
    fs.writeFileSync(targetPath, Buffer.from(dataUrl.split(",")[1] || "", "base64"));
  else fs.writeFileSync(targetPath, text || "", "utf8");

  return true;
};

window.clipboardBridge = { read, write, saveFile };
