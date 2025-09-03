import { uploadHistory } from './api/endpoints';
import { HistoryPayload } from './api/models';
import { AxiosError } from 'axios';
import { getLocal, setLocal } from './utils/storage';

export {};

// 設定・型 -----------------------------------------------------------
type FilterMode = 'blacklist' | 'whitelist';
interface PageData extends HistoryPayload {}
interface Message {
  type: string;
  data: PageData;
}

const STORAGE_KEYS = {
  filterMode: 'filterMode',
  isLoggingEnabled: 'isLoggingEnabled',
  ignorePatterns: 'ignorePatterns',
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
} as const;

const DEFAULTS = {
  filterMode: 'blacklist' as FilterMode,
  isLoggingEnabled: true,
  ignorePatterns: [] as string[],
};

const PENDING_KEY = 'pendingUploads';
type QueueItem = PageData;
let isFlushing = false;

// ストレージ ヘルパー（Promise化） -----------------------------------

// 初期設定: ストレージのデフォルト値をセット ----------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const data = await getLocal([STORAGE_KEYS.filterMode, STORAGE_KEYS.isLoggingEnabled, STORAGE_KEYS.ignorePatterns]);
  const updates: Record<string, any> = {};

  const fm = data[STORAGE_KEYS.filterMode];
  if (fm !== 'blacklist' && fm !== 'whitelist') updates[STORAGE_KEYS.filterMode] = DEFAULTS.filterMode;

  const il = data[STORAGE_KEYS.isLoggingEnabled];
  if (typeof il !== 'boolean') updates[STORAGE_KEYS.isLoggingEnabled] = DEFAULTS.isLoggingEnabled;

  const ip = data[STORAGE_KEYS.ignorePatterns];
  if (!Array.isArray(ip)) updates[STORAGE_KEYS.ignorePatterns] = DEFAULTS.ignorePatterns;

  if (Object.keys(updates).length > 0) await setLocal(updates);
});

// ブラウザ起動時に保留キューを再送試行
chrome.runtime.onStartup?.addListener(() => {
  void flushQueue();
});

// メッセージ(pageData)の受信 → サーバー送信 -----------------------------
chrome.runtime.onMessage.addListener((message: Message, sender) => {
  if (message?.type === 'pageData') {
    void handlePageData(message.data, sender);
  }
});

// URLフィルタ判定 ------------------------------------------------------
function safeTest(pattern: string, url: string): boolean {
  try {
    return new RegExp(pattern).test(url);
  } catch {
    console.warn('無効な正規表現を無視:', pattern);
    return false;
  }
}

function shouldLogUrl(url: string, patterns: string[], mode: FilterMode): boolean {
  if (mode === 'whitelist') {
    if (!patterns.length) return false; // ホワイトリスト空なら何も記録しない
    return patterns.some((p) => safeTest(p, url));
  }
  // ブラックリスト: パターン一致なら除外
  return !patterns.some((p) => safeTest(p, url));
}

// ページデータ処理の入口 -----------------------------------------------
async function handlePageData(pageData: PageData, sender: chrome.runtime.MessageSender) {
  const url = pageData?.url || sender?.tab?.url || '';
  const data = await getLocal([
    STORAGE_KEYS.isLoggingEnabled,
    STORAGE_KEYS.ignorePatterns,
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.filterMode,
  ]);

  const isLoggingEnabled: boolean = data[STORAGE_KEYS.isLoggingEnabled] !== false; // 既定で有効
  if (!isLoggingEnabled) return; // ログ無効

  const hasAnyToken = Boolean(data[STORAGE_KEYS.accessToken] || data[STORAGE_KEYS.refreshToken]);
  if (!hasAnyToken) {
    chrome.runtime.sendMessage({ type: 'authRequired' });
    return;
  }

  const patterns: string[] = Array.isArray(data[STORAGE_KEYS.ignorePatterns])
    ? data[STORAGE_KEYS.ignorePatterns]
    : DEFAULTS.ignorePatterns;
  const mode: FilterMode = data[STORAGE_KEYS.filterMode] === 'whitelist' ? 'whitelist' : 'blacklist';

  if (!shouldLogUrl(url, patterns, mode)) return; // フィルタ除外

  void sendDataToServer(pageData);
}

// アップロード失敗キュー（永続） ----------------------------------------
async function enqueue(item: QueueItem) {
  const current = await getLocal(PENDING_KEY);
  const list: QueueItem[] = Array.isArray(current[PENDING_KEY]) ? current[PENDING_KEY] : [];
  const MAX = 200; // 無制限増加を防止
  const next = [...list, item].slice(-MAX);
  await setLocal({ [PENDING_KEY]: next });
}

async function flushQueue() {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const current = await getLocal(PENDING_KEY);
    const list: QueueItem[] = Array.isArray(current[PENDING_KEY]) ? current[PENDING_KEY] : [];
    if (list.length === 0) return;

    // 先頭から順に送信。失敗した時点で残りを保存して中断。
    for (let i = 0; i < list.length; i++) {
      try {
        await uploadHistory(list[i]);
      } catch {
        await setLocal({ [PENDING_KEY]: list.slice(i) });
        return;
      }
    }

    await setLocal({ [PENDING_KEY]: [] });
  } finally {
    isFlushing = false;
  }
}

// サーバー送信（失敗時はキューへ） --------------------------------------
async function sendDataToServer(data: PageData) {
  try {
    await uploadHistory(data);
    // 成功後に保留分をドレイン
    void flushQueue();
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 401) {
      chrome.runtime.sendMessage({ type: 'authInvalid' });
    }
    await enqueue(data);
  }
}