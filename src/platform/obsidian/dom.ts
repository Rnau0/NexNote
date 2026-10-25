/**
 * 一些与 Obsidian DOM 相关的小工具。
 */

/** 读取用户当前在 root 内部选中的文字；选区不在 root 内则返回空串 */
export function readSelectionWithin(root: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  if (!root.contains(container)) {
    return "";
  }
  return selection.toString();
}

/** 让输入框跟随内容自动增高（上限 maxPx） */
export function autoGrow(textarea: HTMLTextAreaElement, maxPx = 180): void {
  textarea.style.height = "auto";
  const next = Math.min(maxPx, Math.max(28, textarea.scrollHeight));
  textarea.style.height = `${next}px`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}
