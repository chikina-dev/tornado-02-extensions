export {};

// ページ情報（URL/タイトル/description等）を抽出してバックグラウンドへ送信
(function () {
  const extract = () => {
    const url = location.href;
    const title = document.title;
    const descNode = document.querySelector('meta[name="description"]');
    const description = descNode?.getAttribute('content') ?? '';
    const timestamp = new Date().toISOString();
    return { url, title, description, timestamp };
  };

  const send = () => {
    chrome.runtime.sendMessage({ type: 'pageData', data: extract() });
  };

  // 初回送信
  send();

  // SPA等のURL変化に対して簡易デバウンス
  let lastHref = location.href;
  let timer: number | null = null;
  const observer = new MutationObserver(() => {
    if (lastHref === location.href) return;
    lastHref = location.href;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(send, 300);
  });
  observer.observe(document, { subtree: true, childList: true });
})();
