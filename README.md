# Viofolio（検索履歴コレクタ拡張）

Chrome 拡張で閲覧ページのメタ情報（URL/タイトル/説明/時刻）を収集し、FastAPI サーバーへ送信します。JWT 認証、URL フィルタ（ブラック/ホワイト）、ローカル CSV、間隔モードに対応。

## クイックスタート

前提: Node.js 18+ / npm

```zsh
npm i
npm run dev   # 開発
npm run build # ビルド（dist/）
```

Chrome > 拡張機能 > デベロッパーモード ON > 「パッケージ化されていない拡張機能を読み込む」から dist/ を選択。

## 設定（サーバー）

- API ベース URL: `src/api/mutator.ts` の `API_URL`
- 権限: `public/manifest.json` の `host_permissions`

API スキーマ変更時は orval で生成更新:

```zsh
npm run generate:api
```

## 使い方

- ポップアップ: ログ送信 ON/OFF、開いているサイトをブラック/ホワイトに追加、オプションへ移動、ログアウト
- オプション: ログイン/ログアウト、収集設定（ON/OFF・間隔秒）、URL フィルタ（正規表現・モード切替）、ローカル履歴の検索・CSV ダウンロード/クリア
- 間隔モード: 指定秒数以上滞在したページのみ送信（タブの URL 変更/クローズで評価）

## 仕様メモ

- 認証: アクセストークン自動リフレッシュ。失効時は `authInvalid` 通知
- 送信失敗時は永続キューに退避し順次再送（最大200件）
- ローカル CSV は最新5,000行（ヘッダー含む）を保存

## ライセンス

MIT

