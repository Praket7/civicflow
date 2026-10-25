/** True only inside the Tauri webview, where IPC commands are available. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Opens a page outside the app. Provider sign-in has to run in the system
 * browser: Google refuses to render its consent screen inside a webview.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external_url", { url });
    return;
  }
  window.location.assign(url);
}
