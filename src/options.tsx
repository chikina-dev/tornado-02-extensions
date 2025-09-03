import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useGetProfile, getGetProfileQueryKey, useLogin } from './api/endpoints';
import './index.css';
import { getLocal, setLocal, removeLocal } from './utils/storage';

const queryClient = new QueryClient();

// 簡易的な難読化（保存用）
const encode = (str: string) => btoa(encodeURIComponent(str));
const decode = (str: string) => decodeURIComponent(atob(str));

// 

const PatternsSection = () => {
  const [patterns, setPatterns] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [mode, setMode] = useState<'blacklist' | 'whitelist'>('blacklist');

  useEffect(() => {
    (async () => {
      const data = await getLocal({ ignorePatterns: [], filterMode: 'blacklist' });
      setPatterns(Array.isArray(data.ignorePatterns) ? data.ignorePatterns : []);
      setMode(data.filterMode === 'whitelist' ? 'whitelist' : 'blacklist');
    })();
  }, []);

  const savePatterns = async (newPatterns: string[]) => {
    setPatterns(newPatterns);
    await setLocal({ ignorePatterns: newPatterns });
  };

  const handleAddPattern = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPattern.trim();
    if (trimmed && !patterns.includes(trimmed)) {
      savePatterns([...patterns, trimmed]);
      setNewPattern('');
    }
  };

  const handleRemovePattern = (patternToRemove: string) => {
    savePatterns(patterns.filter(p => p !== patternToRemove));
  };

  const handleModeChange = async (newMode: 'blacklist' | 'whitelist') => {
    setMode(newMode);
    await setLocal({ filterMode: newMode });
  };

  const title = mode === 'blacklist' ? 'ブラックリスト（正規表現）' : 'ホワイトリスト（正規表現）';
  const help = mode === 'blacklist'
    ? 'パターンに一致するURLは記録しません。'
    : 'パターンに一致するURLのみ記録します。';

  return (
    <div className="p-6 bg-primary-900/20 border border-primary-800/40 rounded-lg shadow-md mt-8 text-slate-100 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-primary-200/90">{title}</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className={"px-2 py-1 rounded-md border " + (mode==='blacklist' ? 'bg-primary-700/40 border-primary-600' : 'bg-primary-900/20 border-primary-800/40')}>Blacklist</span>
          <label className="relative inline-block w-10 h-6">
            <input type="checkbox" className="sr-only" checked={mode==='whitelist'} onChange={(e)=>handleModeChange(e.target.checked?'whitelist':'blacklist')} />
            <span className="block w-10 h-6 rounded-full bg-primary-800/40"></span>
            <span className={"dot absolute top-0 left-0 w-6 h-6 bg-white rounded-full transition " + (mode==='whitelist'?'translate-x-4 border-4 border-primary-500':'border-4 border-slate-300')}></span>
          </label>
          <span className={"px-2 py-1 rounded-md border " + (mode==='whitelist' ? 'bg-primary-700/40 border-primary-600' : 'bg-primary-900/20 border-primary-800/40')}>Whitelist</span>
        </div>
      </div>
      <p className="text-xs text-slate-200 mb-3">{help}</p>
      <form onSubmit={handleAddPattern} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          placeholder="正規表現パターンを入力（例: ^https?://example\\.com/）"
          className="flex-grow px-3 py-2 border border-primary-800/40 bg-primary-950/50 text-slate-100 placeholder:text-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <button type="submit" className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-primary-500 hover:bg-primary-400">
          追加
        </button>
      </form>
      <ul className="space-y-2">
        {patterns.map((pattern) => (
          <li key={pattern} className="flex justify-between items-center p-2 bg-primary-900/20 border border-primary-800/40 rounded-md backdrop-blur-sm">
            <span className="font-mono text-sm text-slate-100">{pattern}</span>
            <button onClick={() => handleRemovePattern(pattern)} className="text-rose-300 hover:text-rose-200 font-semibold">
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const UsageSection = () => (
  <div className="p-6 mt-8 bg-primary-900/20 border border-primary-800/40 rounded-lg shadow-md text-slate-100 backdrop-blur-sm">
    <h3 className="text-xl font-semibold text-primary-200/90 mb-3">使い方</h3>
    <ul className="list-disc pl-5 space-y-2 text-sm">
      <li>まずは「ログイン」してください。メール・パスワードを保存して次回以降の入力を省略できます。</li>
      <li>記録対象は「ブラックリスト／ホワイトリスト」で制御します。正規表現でパターンを登録できます。</li>
      <li>ポップアップから「このサイトをブラック/ホワイトに追加」で、開いているサイトを一発登録できます。</li>
      <li>ログ送信を一時停止したい場合は、ポップアップの「ログ送信」をオフにしてください。</li>
      <li>認証エラーや未認証のときは通知されます。再ログインを実施すると復旧します。</li>
      <li>例: ドメイン単位で除外 → <span className="font-mono">^https?://example\\.com/.*</span></li>
    </ul>
  </div>
);

const Options = () => {
  const queryClient = useQueryClient();
  const [isTokenChecked, setIsTokenChecked] = useState(false);
  const [hasAnyToken, setHasAnyToken] = useState(false);

  const { data: userProfile, isLoading } = useGetProfile(undefined, {
    query: {
      queryKey: getGetProfileQueryKey(),
      enabled: isTokenChecked && hasAnyToken
    }
  });
  const loginMutation = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 認証状態・保存済み情報の読み込み
  useEffect(() => {
    (async () => {
      const data = await getLocal(['accessToken', 'refreshToken', 'savedEmail', 'savedPassword']);
      setHasAnyToken(Boolean(data.accessToken || data.refreshToken));
      if (data.savedEmail) setEmail(decode(data.savedEmail));
      if (data.savedPassword) setPassword(decode(data.savedPassword));
      setIsTokenChecked(true);
    })();
  }, []);

  // ログイン → トークン保存
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await loginMutation.mutateAsync({ data: { email: email, password } });
      const credentials = {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        savedEmail: encode(email),
        savedPassword: encode(password),
      };
      await setLocal(credentials);
      setHasAnyToken(true);
      await queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    } catch (err) {
      console.error('Login failed:', err);
      alert('Login failed. Please check your credentials.');
    }
  };

  // ログアウト → トークン削除
  const handleLogout = async () => {
    const keysToRemove = ['accessToken', 'refreshToken', 'savedEmail', 'savedPassword'];
    await removeLocal(keysToRemove);
    setHasAnyToken(false);
    await queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
  };

  if (!isTokenChecked || (isLoading && hasAnyToken)) {
    return <div className="text-center p-10">状態を確認中...</div>;
  }

  if (!userProfile) {
    return (
      <div className="max-w-md mx-auto mt-10 p-8 border border-primary-800/40 rounded-lg shadow-lg bg-primary-900/20 text-slate-100 backdrop-blur-sm">
        <h2 className="text-2xl font-semibold mb-6 text-center text-primary-200/90">ログイン</h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-100">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-primary-800/40 bg-primary-950/50 text-slate-100 placeholder:text-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-100">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-primary-800/40 bg-primary-950/50 text-slate-100 placeholder:text-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-primary-500 hover:bg-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-slate-500"
          >
            {loginMutation.isPending ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8 p-6 bg-primary-900/20 border border-primary-800/40 rounded-lg shadow-md text-slate-100 backdrop-blur-sm">
        <h2 className="text-2xl">ようこそ、<span className="font-semibold text-primary-200/90">{userProfile.email}</span> さん</h2>
        <button
          onClick={handleLogout}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-rose-500 hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
        >
          ログアウト
        </button>
      </div>
      <PatternsSection />
      <UsageSection />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
    <div className="p-8 min-h-screen text-slate-100 bg-transparent">
        <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-primary-200/90">オプション</h1>
          <Options />
        </div>
      </div>
    </QueryClientProvider>
  </React.StrictMode>
);
