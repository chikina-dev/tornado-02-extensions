import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useGetProfile, getGetProfileQueryKey, useLogin } from './api/endpoints';
import './index.css';
import { getLocal, setLocal, removeLocal } from './utils/storage';
import { CollectionSettings } from './features/collection-settings';
import { PatternsCard } from './features/patterns';
import { UsageCard } from './features/usage';
import { LoginCard } from './features/login-card';
import { WelcomeCard } from './features/welcome-card';
import LocalHistorySection from './components/local-history-section';

const queryClient = new QueryClient();

// 簡易的な難読化（保存用）
const encode = (str: string) => btoa(encodeURIComponent(str));
const decode = (str: string) => decodeURIComponent(atob(str));

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
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const handleLogout = async () => {
    setIsLoggingOut(true);
    const keysToRemove = ['accessToken', 'refreshToken', 'savedEmail', 'savedPassword'];
    await removeLocal(keysToRemove);
    setHasAnyToken(false);
  // Clear cached profile so the UI immediately shows the login view
  await queryClient.removeQueries({ queryKey: getGetProfileQueryKey() });
  await queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    setIsLoggingOut(false);
  };

  if (!isTokenChecked || (isLoading && hasAnyToken)) {
    return <div className="text-center p-10">状態を確認中...</div>;
  }

  if (!userProfile) {
    return (
      <div className="mt-10">
        <LoginCard
          email={email}
          password={password}
          loading={loginMutation.isPending}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={() => void handleLogin()}
        />
      </div>
    );
  }

  return (
    <div>
  <div className="mb-8"><WelcomeCard email={userProfile.email} onLogout={handleLogout} loading={isLoggingOut} /></div>
          <div className="mb-8">
            <CollectionSettings />
          </div>
      <div className="mb-8"><PatternsCard /></div>
      <LocalHistorySection />
      <UsageCard />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
    <div className="p-8 min-h-screen text-slate-100 bg-transparent">
        <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <img src="/viofolio.png" alt="Viofolio" className="w-8 h-8" />
        <h1 className="text-3xl font-semibold text-primary-200/90">Viofolio</h1>
      </div>
          <Options />
        </div>
      </div>
    </QueryClientProvider>
  </React.StrictMode>
);
