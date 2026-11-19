import type { ClipboardBridge } from "./index";

declare global {
  interface Window {
    /** preload.js 注入的剪贴板桥接，仅在 uTools 中运行时存在 */
    clipboardBridge?: ClipboardBridge;
  }
}
