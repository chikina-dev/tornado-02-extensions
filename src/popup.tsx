import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useGetProfile, getGetProfileQueryKey, useLogout } from './api/endpoints';
import './index.css';
import { getLocal, setLocal, removeLocal } from './utils/storage';

const queryClient = new QueryClient();

// 

const Popup = () => {
  const queryClient = useQueryClient();
  const [isTokenChecked, setIsTokenChecked] = useState(false);
  const [hasAnyToken, setHasAnyToken] = useState(false);

  const { data: userProfile, isLoading } = useGetProfile(undefined, {
    query: {
      queryKey: getGetProfileQueryKey(),
      enabled: isTokenChecked && hasAnyToken
    }
  });
  const logoutMutation = useLogout();

  const [isLoggingEnabled, setIsLoggingEnabled] = useState(true);
  const [filterMode, setFilterMode] = useState<'blacklist'|'whitelist'>('blacklist');

  useEffect(() => {
    (async () => {
      const data = await getLocal({ isLoggingEnabled: true, accessToken: null, refreshToken: null, filterMode: 'blacklist' });
      setIsLoggingEnabled(Boolean(data.isLoggingEnabled));
      setHasAnyToken(Boolean(data.accessToken || data.refreshToken));
      setFilterMode(data.filterMode === 'whitelist' ? 'whitelist' : 'blacklist');
      setIsTokenChecked(true);
    })();
  }, []);

  const handleToggleLogging = async (enabled: boolean) => {
    setIsLoggingEnabled(enabled);
    await setLocal({ isLoggingEnabled: enabled });
  };

  const handleLogout = async () => {
    const { refreshToken } = await getLocal('refreshToken');
    if (refreshToken) {
      try {
        await logoutMutation.mutateAsync({ data: { refresh_token: refreshToken } });
      } catch (e) {
        console.error("Logout failed on server, proceeding with client-side cleanup.", e);
      }
    }
    const keysToRemove = ['accessToken', 'refreshToken', 'savedEmail', 'savedPassword'];
    await removeLocal(keysToRemove);
    setHasAnyToken(false);
    await queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
  };

  const handleToggleSiteFilter = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      try {
        const url = new URL(tab.url);
        const escapedHost = url.hostname.replace(/\./g, '\\.');
        const domainPattern = `^https?://${escapedHost}/.*`;

        const data = await getLocal({ ignorePatterns: [], filterMode: 'blacklist' });
        const ignorePatterns: string[] = Array.isArray(data.ignorePatterns) ? data.ignorePatterns : [];
        const mode: 'blacklist' | 'whitelist' = data.filterMode === 'whitelist' ? 'whitelist' : 'blacklist';

        if (!ignorePatterns.includes(domainPattern)) {
          await setLocal({ ignorePatterns: [...ignorePatterns, domainPattern] });
          alert(mode === 'blacklist' ? `${url.hostname} をブラックリストに追加しました。` : `${url.hostname} をホワイトリストに追加しました。`);
        } else {
          alert(mode === 'blacklist' ? `${url.hostname} は既にブラックリストに存在します。` : `${url.hostname} は既にホワイトリストに存在します。`);
        }
      } catch (e) {
        console.error('無効なURL:', tab.url);
      }
    }
  };

  const openOptionsPage = () => {
    chrome.runtime.openOptionsPage();
  };

  const renderStatus = () => {
    if (!isTokenChecked || (isLoading && hasAnyToken)) {
      return <div className="text-center text-slate-200">確認中...</div>;
    }
    return (
      <div className="p-3 bg-primary-900/20 border border-primary-800/40 rounded-lg shadow-sm backdrop-blur-sm">
        <p className="text-sm text-center text-slate-100/90">
          ステータス: {userProfile ? <span className="font-semibold text-emerald-300">ログイン済み</span> : <span className="font-semibold text-rose-300">未ログイン</span>}
        </p>
        {userProfile && <p className="text-xs text-center text-slate-200 truncate">{userProfile.email}</p>}
      </div>
    );
  };

  return (
    <div className="p-4 w-72 bg-primary-950/60 text-slate-100 space-y-4">
  <h1 className="text-lg font-semibold text-center text-primary-300/90">検索ログコレクター</h1>
      
  {renderStatus()}

      {userProfile && (
        <>
          <div className="flex items-center justify-between p-3 bg-primary-900/20 border border-primary-800/40 rounded-lg shadow-sm backdrop-blur-sm">
            <label htmlFor="logging-toggle" className="text-sm font-semibold text-slate-100/95">ログ送信</label>
            <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
              <input
                type="checkbox"
                name="logging-toggle"
                id="logging-toggle"
                checked={isLoggingEnabled}
                onChange={(e) => handleToggleLogging(e.target.checked)}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
              />
              <label htmlFor="logging-toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-primary-800/40 cursor-pointer"></label>
            </div>
          </div>

          <button onClick={handleToggleSiteFilter} className="w-full text-sm text-center py-2 px-4 border border-primary-800/40 rounded-md shadow-sm bg-primary-900/20 hover:bg-primary-800/30 text-slate-100/95 backdrop-blur-sm">
            {filterMode === 'blacklist' ? 'このサイトをブラックリストに追加' : 'このサイトをホワイトリストに追加'}
      </button>
        </>
      )}

      <div className="flex gap-2">
        <button onClick={openOptionsPage} className="flex-1 text-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-primary-500 hover:bg-primary-400">
          オプション
        </button>
        {userProfile && (
          <button onClick={handleLogout} disabled={logoutMutation.isPending} className="flex-1 text-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-rose-500 hover:bg-rose-400 disabled:bg-slate-500">
            ログアウト
          </button>
        )}
      </div>
      <style>{`
        .toggle-checkbox:checked { right: 0; border-color: #7c3aed; }
        .toggle-checkbox:checked + .toggle-label { background-color: #7c3aed; }
      `}</style>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Popup />
    </QueryClientProvider>
  </React.StrictMode>
);