import Axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { getLocalKey, setLocal, removeLocal, getSingleFlight, setSingleFlight } from '../utils/storage';

// APIベースURL
const API_URL = 'https://tornado2025.chigayuki.com';

// 共通Axiosインスタンス
export const AXIOS_INSTANCE = Axios.create({ baseURL: API_URL });

// chrome.storage ヘルパー（Promise化）

// リフレッシュの単一実行制御（HMR時も共通化）
type RefreshResult = { access: string; refresh?: string } | null;
const REFRESH_KEY = 'auth:refresh';

// トークンリフレッシュ
const doRefresh = async (): Promise<RefreshResult> => {
  const refreshToken: string | null = await getLocalKey('refreshToken');
  if (!refreshToken) return null;
  try {
    // baseURLを使わず絶対URLで直接POST（再帰/認証絡みの副作用を避ける）
    const resp = await Axios.post(`${API_URL}/refresh`, { refresh_token: refreshToken }, {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = resp.data as { access_token: string; refresh_token?: string };
    const toSave: Record<string, any> = { accessToken: data.access_token };
    if (data.refresh_token) toSave.refreshToken = data.refresh_token;
  await setLocal(toSave);
    return { access: data.access_token, refresh: data.refresh_token };
  } catch {
    // 失敗時はトークン破棄し通知
  await removeLocal(['accessToken', 'refreshToken']);
    try { chrome.runtime.sendMessage({ type: 'authInvalid' }); } catch {}
    return null;
  }
};

// リクエスト実行
const execRequest = async <T>(config: AxiosRequestConfig, accessToken?: string, cancelToken?: any): Promise<T> => {
  const headers = {
    ...config.headers,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  } as Record<string, any>;
  const resp = await AXIOS_INSTANCE({ ...config, headers, cancelToken });
  return resp.data as T;
};

// Orvalが利用するカスタムインスタンス
export const customInstance = async <T>(config: AxiosRequestConfig): Promise<T> => {
  // React Queryキャンセル用
  const source = Axios.CancelToken.source();

  const promise: Promise<T> = new Promise<T>(async (resolve, reject) => {
    try {
      // 事前にアクセストークンを取得（なければリフレッシュ試行）
      let access = await getLocalKey<string>('accessToken');
      if (!access) {
        const hasRefresh = await getLocalKey<string>('refreshToken');
        if (hasRefresh) {
          let p = getSingleFlight<RefreshResult>(REFRESH_KEY);
          if (!p) {
            p = doRefresh().finally(() => setSingleFlight(REFRESH_KEY, null));
            setSingleFlight(REFRESH_KEY, p);
          }
          const refreshed = await p;
          if (refreshed?.access) access = refreshed.access as any;
        }
      }

      try {
        const data = await execRequest<T>(config, access ?? undefined, source.token);
        return resolve(data);
      } catch (err: any) {
        const status: number | undefined = (err as AxiosError)?.response?.status;
        const isRefreshEndpoint = typeof config.url === 'string' && config.url.includes('/refresh');
        if ((status !== 401 && status !== 403) || isRefreshEndpoint) return reject(err);

        // 単一実行でリフレッシュし、再試行
        let p = getSingleFlight<RefreshResult>(REFRESH_KEY);
        if (!p) {
          p = doRefresh().finally(() => setSingleFlight(REFRESH_KEY, null));
          setSingleFlight(REFRESH_KEY, p);
        }
        const refreshed = await p;
        if (!refreshed?.access) return reject(err);

        try {
          const data2 = await execRequest<T>(config, refreshed.access, source.token);
          return resolve(data2);
        } catch (err2) {
          return reject(err2);
        }
      }
    } catch (fatal) {
      return reject(fatal);
    }
  });

  // React Query向け cancel を付与
  // @ts-ignore
  promise.cancel = () => source.cancel('Query was cancelled by React Query');

  return promise;
};

export default customInstance;
