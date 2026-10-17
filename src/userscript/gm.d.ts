// Userscript manager APIs (Tampermonkey / Violentmonkey) used by the userscript build.
declare function GM_getValue<T = unknown>(key: string, defaultValue?: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_deleteValue(key: string): void;
declare function GM_listValues(): string[];
declare function GM_addStyle(css: string): HTMLStyleElement | void;
declare function GM_registerMenuCommand(caption: string, onClick: () => void): unknown;
declare const GM_addValueChangeListener:
  | ((key: string, cb: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void) => unknown)
  | undefined;
declare function GM_xmlhttpRequest(details: {
  method?: string;
  url: string;
  timeout?: number;
  responseType?: string;
  onload?: (r: { status: number; responseText: string }) => void;
  onerror?: (e: unknown) => void;
  ontimeout?: () => void;
}): unknown;

/** Injected by vite.userscript.config.ts */
declare const __ALR_VERSION__: string;
declare const __ALR_REPO__: string;
