/** True only inside the Tauri webview, where IPC commands are available. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
