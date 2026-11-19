import {
  ClipboardFormat,
  CopyResult,
  ClipboardParseResult,
  ClipboardDataItem,
  ClipboardDataType,
  ClipboardBridgeEntry,
  FileInfo,
} from "../types";

// 提取的剪贴板数据接口
interface ExtractedClipboardData {
  type: "DataTransfer";
  types?: Array<{
    type: string;
    data: string | FileInfo;
  }>;
  items?: Array<{
    kind: string;
    type: string;
    as_file: FileInfo | null;
  }> | null;
  files?: Array<FileInfo | null> | null;
}

// 文件信息辅助函数
const createFileInfo = (file: File | null): FileInfo | null => {
  if (!file) return null;
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    url: URL.createObjectURL(file),
    lastModified: file.lastModified,
  };
};

// 核心数据提取函数（粘贴 / 拖放事件）
const extractClipboardData = async (
  data: DataTransfer,
): Promise<ExtractedClipboardData | undefined> => {
  if (!data) {
    return undefined;
  }

  return {
    type: "DataTransfer",
    types: Array.from(data.types).map((type) => ({
      type,
      data: data.getData(type),
    })),
    items: data.items
      ? Array.from(data.items).map((item) => ({
          kind: item.kind,
          type: item.type,
          as_file: createFileInfo(item.getAsFile()),
        }))
      : null,
    files: data.files ? Array.from(data.files).map(createFileInfo) : null,
  };
};

/**
 * 转换为我们的数据格式
 */
const convertToClipboardDataItems = async (
  extractedData: ExtractedClipboardData | undefined,
): Promise<ClipboardDataItem[]> => {
  if (!extractedData) return [];

  const results: ClipboardDataItem[] = [];
  const processedFiles = new Set<string>(); // 用于文件去重

  // 处理 types 数据
  if (extractedData.types) {
    for (const typeData of extractedData.types) {
      if (typeData.data) {
        const detectedType = detectDataType(
          typeData.type,
          typeof typeData.data === "string" ? typeData.data : undefined,
        );
        const metadata =
          typeof typeData.data === "string"
            ? await analyzeContent(typeData.data, typeData.type)
            : {};

        results.push({
          type: detectedType,
          content: typeData.data,
          size:
            typeof typeData.data === "string"
              ? new Blob([typeData.data]).size
              : (typeData.data as FileInfo).size,
          preview:
            typeof typeData.data !== "string" &&
            typeData.type.startsWith("image/")
              ? typeData.data.url
              : undefined,
          metadata: {
            ...metadata,
            source: "datatransfer-types",
            mimeType: typeData.type,
          },
        });
      }
    }
  }

  // 处理 files 数据（优先处理，因为信息更完整）
  if (extractedData.files) {
    for (const file of extractedData.files) {
      if (file) {
        // 创建文件唯一标识符
        const fileKey = `${file.name}-${file.size}-${file.type}`;
        if (processedFiles.has(fileKey)) {
          continue;
        }
        processedFiles.add(fileKey);

        const detectedType = detectDataType(file.type);

        results.push({
          type: detectedType,
          content: file,
          size: file.size,
          preview: file.type.startsWith("image/") ? file.url : undefined,
          metadata: {
            source: "datatransfer-files",
            mimeType: file.type,
            fileInfo: file,
          },
        });
      }
    }
  }

  // 处理 items 数据（仅处理未重复的文件）
  if (extractedData.items) {
    for (const item of extractedData.items) {
      if (item.as_file) {
        const file = item.as_file;
        // 创建文件唯一标识符
        const fileKey = `${file.name}-${file.size}-${file.type}`;
        if (processedFiles.has(fileKey)) {
          continue; // 跳过已处理的文件
        }
        processedFiles.add(fileKey);

        const detectedType = detectDataType(file.type);

        results.push({
          type: detectedType,
          content: file,
          size: file.size,
          preview: file.type.startsWith("image/") ? file.url : undefined,
          metadata: {
            source: "datatransfer-items",
            mimeType: file.type,
            fileInfo: file,
            itemKind: item.kind,
            itemType: item.type,
          },
        });
      }
    }
  }

  return results;
};

/**
 * 浏览器环境下的写入回退（npm run dev / localhost / HTTPS）
 */
const writeViaBrowser = async (
  content: string,
  format: ClipboardFormat,
): Promise<void> => {
  const clip = navigator.clipboard;
  if (!clip) throw new Error("当前环境不支持剪贴板 API");

  if (format === "text/html") {
    const plain = content.replace(/<[^>]+>/g, "").trim();
    await clip.write([
      new ClipboardItem({
        "text/html": new Blob([content], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }
  if (format === "text/rtf") {
    throw new Error("浏览器不支持写入 RTF，请在 uTools 中使用");
  }
  await clip.writeText(content);
};

/**
 * 主要的剪贴板写入函数
 * uTools 中走 preload 桥接，浏览器中走 Web Clipboard API
 */
export const copyToClipboard = async (
  content: string,
  format: ClipboardFormat,
): Promise<CopyResult> => {
  // 检查内容是否为空
  if (!content.trim()) {
    return { success: false, message: "内容不能为空" };
  }

  try {
    const bridge = window.clipboardBridge;
    if (bridge) {
      if (!bridge.write(format, content)) {
        throw new Error("写入剪贴板失败");
      }
    } else {
      await writeViaBrowser(content, format);
    }
    return { success: true, message: "复制成功！" };
  } catch (error) {
    return {
      success: false,
      message: `复制失败：${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
};

/**
 * 检查是否支持剪贴板直接读取
 * uTools 中由 preload 桥接提供，浏览器中由 Web Clipboard API 提供
 */
export const isClipboardReadSupported = (): boolean => {
  return !!window.clipboardBridge || !!navigator.clipboard?.read;
};

/**
 * 检查是否在安全上下文中（HTTPS 或 localhost）
 */
export const isSecureContext = (): boolean => {
  return window.isSecureContext || location.hostname === "localhost";
};

/**
 * 获取文件大小的可读格式
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * 检测剪贴板数据类型
 */
export const detectDataType = (
  mimeType: string,
  content?: string | Blob | File,
): ClipboardDataType => {
  // 标准化 MIME 类型
  const normalizedType = mimeType.toLowerCase().trim();

  // 特殊处理常见的问题类型
  if (normalizedType === "text" || normalizedType === "") {
    // 如果有内容，进一步分析
    if (typeof content === "string") {
      return detectDataType("text/plain", content);
    }
    return "text/plain";
  }

  // 文本类型
  if (normalizedType === "text/plain") return "text/plain";
  if (normalizedType === "text/html") return "text/html";
  if (normalizedType === "text/rtf" || normalizedType === "application/rtf")
    return "text/rtf";

  // 图片类型
  if (normalizedType === "image/png") return "image/png";
  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg")
    return "image/jpeg";
  if (normalizedType === "image/gif") return "image/gif";
  if (normalizedType === "image/webp") return "image/webp";
  if (normalizedType === "image/svg+xml") return "image/svg+xml";
  if (normalizedType === "image/bmp") return "image/bmp";
  if (normalizedType === "image/tiff") return "image/tiff";

  // 应用程序类型
  if (normalizedType === "application/json") return "application/json";
  if (normalizedType === "application/xml" || normalizedType === "text/xml")
    return "application/xml";
  if (normalizedType === "application/pdf") return "application/pdf";

  // 文件类型检测 - 通过内容或文件扩展名
  if (content instanceof File) {
    const fileName = content.name.toLowerCase();
    if (fileName.endsWith(".rtf")) return "text/rtf";
    if (fileName.endsWith(".json")) return "application/json";
    if (fileName.endsWith(".xml")) return "application/xml";
    if (fileName.endsWith(".html") || fileName.endsWith(".htm"))
      return "text/html";
    if (fileName.endsWith(".txt")) return "text/plain";

    // 图片文件扩展名检测
    if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg"))
      return "image/jpeg";
    if (fileName.endsWith(".png")) return "image/png";
    if (fileName.endsWith(".gif")) return "image/gif";
    if (fileName.endsWith(".webp")) return "image/webp";
    if (fileName.endsWith(".svg")) return "image/svg+xml";
    if (fileName.endsWith(".bmp")) return "image/bmp";
    if (fileName.endsWith(".tiff") || fileName.endsWith(".tif"))
      return "image/tiff";

    // 如果有 MIME 类型但没有匹配到具体类型，使用通用检测
    if (content.type) {
      return detectDataType(content.type);
    }

    return "files";
  }

  // 通过内容智能检测
  if (typeof content === "string") {
    // 空内容检查
    if (!content.trim()) {
      return normalizedType.startsWith("text/") ? "text/plain" : "unknown";
    }

    // JSON 内容检测
    if (
      (content.trim().startsWith("{") && content.trim().endsWith("}")) ||
      (content.trim().startsWith("[") && content.trim().endsWith("]"))
    ) {
      try {
        JSON.parse(content);
        return "application/json";
      } catch {
        // 不是有效的 JSON，继续其他检测
      }
    }

    // XML/HTML 内容检测
    if (content.trim().startsWith("<?xml")) {
      return "application/xml";
    }
    if (
      content.trim().startsWith("<!DOCTYPE html") ||
      content.trim().startsWith("<html")
    ) {
      return "text/html";
    }
    if (content.trim().startsWith("<") && content.trim().endsWith(">")) {
      // 可能是 HTML 片段或 XML
      return normalizedType === "text/html" || normalizedType.includes("html")
        ? "text/html"
        : "application/xml";
    }

    // RTF 内容检测
    if (content.startsWith("{\\rtf")) {
      return "text/rtf";
    }

    // 如果看起来像 URL
    if (content.match(/^https?:\/\//)) {
      return "text/plain";
    }
  }

  // 通用类型检测
  if (normalizedType.startsWith("text/")) return "text/plain";
  if (normalizedType.startsWith("image/")) {
    // 对于未知的图片类型，默认为 PNG
    return "image/png";
  }
  if (normalizedType.startsWith("application/")) {
    // 检查是否是已知的应用程序类型
    if (normalizedType.includes("json")) return "application/json";
    if (normalizedType.includes("xml")) return "application/xml";
    if (normalizedType.includes("pdf")) return "application/pdf";
  }

  // 如果所有检测都失败，根据内容类型返回合理的默认值
  if (typeof content === "string") {
    return "text/plain";
  }

  return "unknown";
};

/**
 * 分析文本内容的编码和语言信息
 */
const analyzeTextContent = (
  content: string,
  mimeType: string,
): { encoding?: string; language?: string; charset?: string } => {
  const metadata: { encoding?: string; language?: string; charset?: string } =
    {};

  // 从 MIME 类型中提取字符集信息
  const charsetMatch = mimeType.match(/charset=([^;]+)/i);
  if (charsetMatch) {
    metadata.charset = charsetMatch[1].trim();
  }

  // 简单的语言检测（基于字符范围）
  if (/[\u4e00-\u9fff]/.test(content)) {
    metadata.language = "zh-CN";
  } else if (/[\u3040-\u309f\u30a0-\u30ff]/.test(content)) {
    metadata.language = "ja";
  } else if (/[\uac00-\ud7af]/.test(content)) {
    metadata.language = "ko";
  } else if (/[а-яё]/i.test(content)) {
    metadata.language = "ru";
  } else if (/[αβγδεζηθικλμνξοπρστυφχψω]/i.test(content)) {
    metadata.language = "el";
  } else {
    metadata.language = "en";
  }

  // 编码检测（简单实现）
  if (content.includes("\ufffd")) {
    metadata.encoding = "corrupted";
  } else {
    metadata.encoding = "utf-8";
  }

  return metadata;
};

/**
 * 增强的文本内容分析
 */
const analyzeTextStructure = (
  content: string,
  type: ClipboardDataType,
): Record<string, unknown> => {
  const analysis: Record<string, unknown> = {};

  if (type === "text/html") {
    // HTML 特定分析
    const hasDoctype = /<!DOCTYPE/i.test(content);
    const hasHtmlTag = /<html[^>]*>/i.test(content);
    const hasHeadTag = /<head[^>]*>/i.test(content);
    const hasBodyTag = /<body[^>]*>/i.test(content);

    // 提取标题
    const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/is);
    if (titleMatch) {
      analysis.title = titleMatch[1].trim();
    }

    // 统计各种元素
    const imgCount = (content.match(/<img[^>]*>/gi) || []).length;
    const linkCount = (content.match(/<a[^>]*>/gi) || []).length;
    const tableCount = (content.match(/<table[^>]*>/gi) || []).length;
    const formCount = (content.match(/<form[^>]*>/gi) || []).length;

    analysis.structure = {
      hasDoctype,
      hasHtmlTag,
      hasHeadTag,
      hasBodyTag,
      isComplete: hasDoctype && hasHtmlTag && hasHeadTag && hasBodyTag,
      elements: {
        images: imgCount,
        links: linkCount,
        tables: tableCount,
        forms: formCount,
      },
    };

    // 提取CSS和JavaScript
    const styleCount = (content.match(/<style[^>]*>/gi) || []).length;
    const scriptCount = (content.match(/<script[^>]*>/gi) || []).length;
    const inlineStyleCount = (content.match(/style\s*=/gi) || []).length;

    analysis.styling = {
      styleTags: styleCount,
      scriptTags: scriptCount,
      inlineStyles: inlineStyleCount,
    };
  } else if (type === "text/rtf") {
    // RTF 特定分析
    const hasRtfHeader = content.startsWith("{\\rtf");
    const versionMatch = content.match(/\\rtf(\d+)/);
    const charsetMatch = content.match(/\\ansi|\\mac|\\pc|\\pca/);

    analysis.rtfInfo = {
      hasValidHeader: hasRtfHeader,
      version: versionMatch ? parseInt(versionMatch[1]) : null,
      charset: charsetMatch ? charsetMatch[0].substring(1) : null,
    };
  } else if (type === "application/json") {
    // JSON 特定分析
    try {
      const parsed = JSON.parse(content);
      analysis.jsonInfo = {
        isValid: true,
        type: Array.isArray(parsed) ? "array" : typeof parsed,
        keys:
          typeof parsed === "object" && parsed !== null
            ? Object.keys(parsed).length
            : 0,
      };
    } catch {
      analysis.jsonInfo = {
        isValid: false,
        error: "Invalid JSON",
      };
    }
  }

  // 通用文本统计
  const lines = content.split("\n").length;
  const words = content.split(/\s+/).filter((word) => word.length > 0).length;
  const characters = content.length;
  const charactersNoSpaces = content.replace(/\s/g, "").length;

  analysis.textStats = {
    lines,
    words,
    characters,
    charactersNoSpaces,
  };

  return analysis;
};

/**
 * 分析内容并生成元数据
 */
export const analyzeContent = async (
  content: string | Blob | File,
  mimeType: string,
): Promise<Record<string, unknown>> => {
  const isBlob = content instanceof Blob;
  const isFile = content instanceof File;

  const metadata: Record<string, unknown> = {
    mimeType,
    formattedSize:
      isBlob || isFile
        ? formatFileSize((content as Blob).size)
        : formatFileSize(new Blob([content as string]).size),
  };

  // 处理文件对象
  if (isFile) {
    const file = content as File;
    metadata.fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    };

    // 如果是文本文件，读取内容进行进一步分析
    if (file.type.startsWith("text/") || file.type === "application/json") {
      try {
        const textContent = await file.text();
        Object.assign(metadata, analyzeTextContent(textContent, mimeType));
        Object.assign(
          metadata,
          analyzeTextStructure(textContent, detectDataType(mimeType, file)),
        );
      } catch {
        // 如果读取失败，继续处理其他元数据
      }
    }

    return metadata;
  }

  // 处理 Blob 对象
  if (isBlob) {
    const blob = content as Blob;
    if (blob.type.startsWith("text/") || blob.type === "application/json") {
      try {
        const textContent = await blob.text();
        Object.assign(metadata, analyzeTextContent(textContent, mimeType));
        Object.assign(
          metadata,
          analyzeTextStructure(textContent, detectDataType(mimeType, blob)),
        );
      } catch {
        // 如果读取失败，继续处理其他元数据
      }
    }

    return metadata;
  }

  // 处理字符串内容
  if (typeof content === "string") {
    Object.assign(metadata, analyzeTextContent(content, mimeType));
    Object.assign(
      metadata,
      analyzeTextStructure(content, detectDataType(mimeType, content)),
    );
  }

  return metadata;
};

// 从 DataTransfer 提取数据（用于 paste 和 drop 事件）
export const extractDataFromDataTransfer = async (
  dataTransfer: DataTransfer,
): Promise<ClipboardDataItem[]> => {
  const extractedData = await extractClipboardData(dataTransfer);
  return convertToClipboardDataItems(extractedData);
};

/**
 * 将 preload 桥接返回的原始条目转换为界面使用的数据项
 */
const bridgeEntryToDataItem = async (
  entry: ClipboardBridgeEntry,
): Promise<ClipboardDataItem> => {
  // 剪贴板中的文件 / 文件夹
  if (entry.file) {
    const file = entry.file;
    return {
      type: detectDataType(file.type || entry.mimeType),
      content: file,
      size: file.size,
      preview: file.type.startsWith("image/") ? file.url : undefined,
      metadata: {
        source: "clipboard-files",
        mimeType: file.type || entry.mimeType,
        fileInfo: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        },
      },
    };
  }

  // 图片以 data URL 返回，包装成文件信息以复用图片预览
  if (entry.dataUrl) {
    const file: FileInfo = {
      name: `clipboard-image.${entry.mimeType.split("/")[1] || "png"}`,
      size: entry.size || 0,
      type: entry.mimeType,
      url: entry.dataUrl,
    };

    return {
      type: detectDataType(entry.mimeType),
      content: file,
      size: file.size,
      preview: entry.dataUrl,
      metadata: {
        source: "clipboard-image",
        mimeType: entry.mimeType,
        formattedSize: formatFileSize(file.size),
      },
    };
  }

  const text = entry.text || "";
  return {
    type: detectDataType(entry.mimeType, text),
    content: text,
    size: new Blob([text]).size,
    metadata: {
      ...(await analyzeContent(text, entry.mimeType)),
      source: "clipboard-read",
    },
  };
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * 浏览器环境下的读取回退（npm run dev / localhost / HTTPS）
 */
const readViaBrowser = async (): Promise<ClipboardBridgeEntry[]> => {
  const clip = navigator.clipboard;
  if (!clip) throw new Error("当前环境不支持剪贴板 API，请在 uTools 中运行");

  if (!clip.read) {
    const text = await clip.readText();
    return text ? [{ mimeType: "text/plain", text }] : [];
  }

  const entries: ClipboardBridgeEntry[] = [];
  for (const item of await clip.read()) {
    for (const type of item.types) {
      const blob = await item.getType(type);
      entries.push(
        type.startsWith("image/")
          ? {
              mimeType: type,
              dataUrl: await blobToDataUrl(blob),
              size: blob.size,
            }
          : { mimeType: type, text: await blob.text() },
      );
    }
  }
  return entries;
};

/**
 * 解析剪贴板内容 - uTools 中走 preload 桥接，浏览器中走 Web Clipboard API
 */
export const parseClipboardData = async (): Promise<ClipboardParseResult> => {
  try {
    const bridge = window.clipboardBridge;
    const entries = bridge ? bridge.read() : await readViaBrowser();

    const dataItems: ClipboardDataItem[] = [];
    for (const entry of entries) {
      dataItems.push(await bridgeEntryToDataItem(entry));
    }

    return {
      source: "read",
      success: true,
      message: dataItems.length
        ? `成功解析 ${dataItems.length} 个数据项`
        : "剪贴板为空",
      data: dataItems,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      source: "read",
      success: false,
      message: `解析失败：${error instanceof Error ? error.message : "未知错误"}`,
      data: [],
      timestamp: Date.now(),
    };
  }
};

/**
 * 另存为 - uTools 中走系统保存对话框，浏览器中退化为下载
 */
export const saveClipboardFile = async (payload: {
  name: string;
  text?: string;
  dataUrl?: string;
  sourcePath?: string;
}): Promise<boolean> => {
  const bridge = window.clipboardBridge;
  if (bridge) return bridge.saveFile(payload);

  const blob = payload.dataUrl
    ? await fetch(payload.dataUrl).then((response) => response.blob())
    : new Blob([payload.text ?? ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = payload.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};

/**
 * 监听粘贴事件 - 增强版，支持 DataTransfer
 */
export const addPasteListener = (
  callback: (result: ClipboardParseResult) => void,
): (() => void) => {
  const handlePaste = async (event: ClipboardEvent) => {
    event.preventDefault();

    try {
      const dataItems: ClipboardDataItem[] = [];

      // 优先处理 DataTransfer 数据
      if (event.clipboardData) {
        const transferResults = await extractDataFromDataTransfer(
          event.clipboardData,
        );
        dataItems.push(...transferResults);
      }

      // 如果没有获取到数据，回退到桥接读取
      if (dataItems.length === 0) {
        const result = await parseClipboardData();
        callback(result);
        return;
      }

      const result: ClipboardParseResult = {
        source: "paste",
        success: true,
        message: `通过粘贴事件成功解析 ${dataItems.length} 个数据项`,
        data: dataItems,
        timestamp: Date.now(),
      };

      callback(result);
    } catch (error) {
      const result: ClipboardParseResult = {
        source: "paste",
        success: false,
        message: `粘贴事件处理失败：${error instanceof Error ? error.message : "未知错误"}`,
        data: [],
        timestamp: Date.now(),
      };

      callback(result);
    }
  };

  document.addEventListener("paste", handlePaste);

  // 返回清理函数
  return () => {
    document.removeEventListener("paste", handlePaste);
  };
};

/**
 * 监听拖放事件
 */
export const addDropListener = (
  callback: (result: ClipboardParseResult) => void,
): (() => void) => {
  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();

    try {
      const dataItems: ClipboardDataItem[] = [];

      if (event.dataTransfer) {
        const transferResults = await extractDataFromDataTransfer(
          event.dataTransfer,
        );
        dataItems.push(...transferResults);
      }

      const result: ClipboardParseResult = {
        source: "drop",
        success: true,
        message: `通过拖放事件成功解析 ${dataItems.length} 个数据项`,
        data: dataItems,
        timestamp: Date.now(),
      };

      callback(result);
    } catch (error) {
      const result: ClipboardParseResult = {
        source: "drop",
        success: false,
        message: `拖放事件处理失败：${error instanceof Error ? error.message : "未知错误"}`,
        data: [],
        timestamp: Date.now(),
      };

      callback(result);
    }
  };

  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("drop", handleDrop);

  // 返回清理函数
  return () => {
    document.removeEventListener("dragover", handleDragOver);
    document.removeEventListener("drop", handleDrop);
  };
};
