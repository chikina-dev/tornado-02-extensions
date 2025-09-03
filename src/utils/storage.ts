// chrome.storage ユーティリティ（Promiseベース）

export type GetKeysArg = string | string[] | Record<string, any> | null | undefined;

// 任意のキー/デフォルト指定で取得（オブジェクトで返す）
export const getLocal = (keys?: GetKeysArg): Promise<Record<string, any>> =>
  new Promise((resolve) => chrome.storage.local.get(keys ?? null, (data) => resolve(data || {})));

// 単一キーの値のみ取得（存在しなければ null）
export const getLocalKey = async <T = any>(key: string): Promise<T | null> => {
  const data = await getLocal(key);
  return (data as any)[key] ?? null;
};

// 保存
export const setLocal = (obj: Record<string, any>): Promise<void> =>
  new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));

// 削除
export const removeLocal = (keys: string | string[]): Promise<void> =>
  new Promise((resolve) => chrome.storage.local.remove(keys, () => resolve()));

// 単一実行（single-flight）ユーティリティ（グローバルに保持）
type Registry = Record<string, Promise<any> | null>;
const REGISTRY_KEY = '__singleflight_registry__';

function getRegistry(): Registry {
  const g = globalThis as any;
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = {} as Registry;
  return g[REGISTRY_KEY] as Registry;
}

export function getSingleFlight<T = any>(key: string): Promise<T> | null {
  const reg = getRegistry();
  return (reg[key] as Promise<T>) ?? null;
}

export function setSingleFlight<T = any>(key: string, p: Promise<T> | null): void {
  const reg = getRegistry();
  reg[key] = p as any;
}
