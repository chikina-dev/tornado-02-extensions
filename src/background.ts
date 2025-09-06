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
  // 収集間隔ベースの送信モード
  intervalModeEnabled: 'intervalModeEnabled',
  intervalThresholdSec: 'intervalThresholdSec',
} as const;

// ローカルCSV保存用キー/制限
const HISTORY_CSV_LINES_KEY = 'localHistoryCsvLines';
const HISTORY_CSV_MAX_LINES = 5000; // ヘッダー含む上限（肥大化防止）
const HISTORY_CSV_HEADER = ['timestamp', 'url', 'title', 'description', 'external_id'] as const;

const DEFAULTS = {
  filterMode: 'blacklist' as FilterMode,
  isLoggingEnabled: true,
  intervalModeEnabled: false,
  intervalThresholdSec: 30,
  // デフォルトで除外するURLパターン（ブラックリスト）
  // - google.com（サブドメイン含む）
  // - localhost（任意ポート）
  ignorePatterns: [
    '^https?://([a-z0-9-]+\\.)?google\\.com/.*',
    '^https?://localhost(:\\d+)?/.*',
  ] as string[],
};

const PENDING_KEY = 'pendingUploads';
type QueueItem = PageData;
let isFlushing = false;

// タブごとの滞在時間管理
type TabState = {
  url: string;
  startedAt: number; // ms
  data: PageData;
};
const tabStates = new Map<number, TabState>();

// ストレージ ヘルパー（Promise化） -----------------------------------

// 初期設定: ストレージのデフォルト値をセット ----------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const data = await getLocal([
    STORAGE_KEYS.filterMode,
    STORAGE_KEYS.isLoggingEnabled,
    STORAGE_KEYS.ignorePatterns,
    STORAGE_KEYS.intervalModeEnabled,
    STORAGE_KEYS.intervalThresholdSec,
  ]);
  const updates: Record<string, any> = {};

  const fm = data[STORAGE_KEYS.filterMode];
  if (fm !== 'blacklist' && fm !== 'whitelist') updates[STORAGE_KEYS.filterMode] = DEFAULTS.filterMode;

  const il = data[STORAGE_KEYS.isLoggingEnabled];
  if (typeof il !== 'boolean') updates[STORAGE_KEYS.isLoggingEnabled] = DEFAULTS.isLoggingEnabled;

  const ip = data[STORAGE_KEYS.ignorePatterns];
  if (!Array.isArray(ip)) updates[STORAGE_KEYS.ignorePatterns] = DEFAULTS.ignorePatterns;

  if (typeof data[STORAGE_KEYS.intervalModeEnabled] !== 'boolean') {
    updates[STORAGE_KEYS.intervalModeEnabled] = DEFAULTS.intervalModeEnabled;
  }
  if (typeof data[STORAGE_KEYS.intervalThresholdSec] !== 'number') {
    updates[STORAGE_KEYS.intervalThresholdSec] = DEFAULTS.intervalThresholdSec;
  }

  if (Object.keys(updates).length > 0) await setLocal(updates);
});

// ブラウザ起動時に保留キューを再送試行
chrome.runtime.onStartup?.addListener(() => {
  void flushQueue();
});

// メッセージ(pageData)の受信 → サーバー送信 -----------------------------
chrome.runtime.onMessage.addListener((message: Message & { requestId?: string }, sender, sendResponse) => {
  if (message?.type === 'pageData') {
  void handlePageData(message.data, sender);
    return; // 応答不要
  }

  if (message?.type === 'getLocalHistoryCsv') {
    // 非同期でCSV文字列を返却
    (async () => {
      const data = await getLocal(HISTORY_CSV_LINES_KEY);
      const lines: string[] = Array.isArray(data[HISTORY_CSV_LINES_KEY]) ? data[HISTORY_CSV_LINES_KEY] : [];
      const csv = lines.join('\n');
      sendResponse({ ok: true, csv, lineCount: lines.length });
    })();
    return true; // 非同期応答
  }

  if (message?.type === 'clearLocalHistoryCsv') {
    (async () => {
      await setLocal({ [HISTORY_CSV_LINES_KEY]: [] });
      sendResponse({ ok: true });
    })();
    return true;
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
    STORAGE_KEYS.intervalModeEnabled,
    STORAGE_KEYS.intervalThresholdSec,
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

  const intervalModeEnabled: boolean = data[STORAGE_KEYS.intervalModeEnabled] === true;
  const thresholdSec: number = typeof data[STORAGE_KEYS.intervalThresholdSec] === 'number'
    ? Math.max(1, data[STORAGE_KEYS.intervalThresholdSec])
    : DEFAULTS.intervalThresholdSec;

  const tabId = sender.tab?.id;
  const now = Date.now();

  if (!intervalModeEnabled || tabId == null) {
    // 通常モード: 即送信
    void sendDataToServer(pageData);
    // 影響を避けるため、このタブの保持中状態はクリア
    if (tabId != null) tabStates.delete(tabId);
    return;
  }

  const current = tabStates.get(tabId);
  if (!current) {
    // 初回: 開いた時刻として保持
    tabStates.set(tabId, { url, startedAt: now, data: pageData });
    return;
  }

  // 同一URLならデータ更新のみ（閉じた扱いにしない）
  if (current.url === url) {
    tabStates.set(tabId, { ...current, data: pageData });
    return;
  }

  // URLが変わった = 前のページが「閉じた」
  const elapsedSec = (now - current.startedAt) / 1000;
  if (elapsedSec >= thresholdSec) {
    void sendDataToServer(current.data);
  }
  // 新しいページとして更新
  tabStates.set(tabId, { url, startedAt: now, data: pageData });
}

// タブが閉じられたときの処理（intervalモード時のみ評価して送信）
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = tabStates.get(tabId);
  if (!state) return;
  const data = await getLocal([
    STORAGE_KEYS.isLoggingEnabled,
    STORAGE_KEYS.intervalModeEnabled,
    STORAGE_KEYS.intervalThresholdSec,
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
  ]);
  const isLoggingEnabled: boolean = data[STORAGE_KEYS.isLoggingEnabled] !== false;
  const intervalModeEnabled: boolean = data[STORAGE_KEYS.intervalModeEnabled] === true;
  const hasAnyToken = Boolean(data[STORAGE_KEYS.accessToken] || data[STORAGE_KEYS.refreshToken]);
  if (!isLoggingEnabled || !intervalModeEnabled || !hasAnyToken) {
    tabStates.delete(tabId);
    return;
  }
  const thresholdSec: number = typeof data[STORAGE_KEYS.intervalThresholdSec] === 'number'
    ? Math.max(1, data[STORAGE_KEYS.intervalThresholdSec])
    : DEFAULTS.intervalThresholdSec;
  const elapsedSec = (Date.now() - state.startedAt) / 1000;
  if (elapsedSec >= thresholdSec) {
    void sendDataToServer(state.data);
  }
  tabStates.delete(tabId);
});

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
    // 先にローカルへCSVとして保存（送信成功/失敗に関わらず手元に残す）
    await appendToLocalCsv(data);

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

// ローカルCSV 追記 ---------------------------------------------------
function csvEscape(value: string): string {
  // ダブルクオートを2つにエスケープし、改行やカンマを含む場合は全体をクオート
  const v = value.replace(/"/g, '""');
  if (/[",\n\r]/.test(v)) return `"${v}"`;
  return v;
}

function toCsvRow(payload: PageData): string {
  const timestamp = payload.timestamp || new Date().toISOString();
  const url = payload.url ?? '';
  const title = payload.title ?? '';
  const description = payload.description ?? '';
  const externalId = payload.external_id ?? '';

  const cols = [timestamp, url, title, description, externalId].map((c) => csvEscape(String(c)));
  return cols.join(',');
}

async function appendToLocalCsv(payload: PageData): Promise<void> {
  const current = await getLocal(HISTORY_CSV_LINES_KEY);
  const lines: string[] = Array.isArray(current[HISTORY_CSV_LINES_KEY]) ? current[HISTORY_CSV_LINES_KEY] : [];

  const hasHeader = lines.length > 0 && lines[0] === HISTORY_CSV_HEADER.join(',');
  const header = HISTORY_CSV_HEADER.join(',');
  const row = toCsvRow(payload);

  const next = hasHeader ? [...lines, row] : [header, row];
  // 上限を超えたら末尾（最新）を優先して保持
  const trimmed = next.slice(-HISTORY_CSV_MAX_LINES);
  await setLocal({ [HISTORY_CSV_LINES_KEY]: trimmed });
}