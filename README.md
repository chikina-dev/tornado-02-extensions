# 検索ログ収集拡張機能

## 1. 概要

Chrome拡張機能を用いて、ユーザーがアクセスしたページのURLおよびメタ情報（タイトル・description等）を収集し、FastAPIサーバーに送信する。
ユーザーは **JWT認証** を用いて認証され、ログ送信は **ignore設定（正規表現・ドメイン単位）** に基づいて制御される。

---

## 2. 機能要件

### 2.1 ログ収集

* 発火条件: `tabs.onUpdated` / `history.onVisited` などでページ遷移を検知
* 収集項目:

  * URL
  * ページタイトル (`document.title`)
  * メタ description (存在すれば)
  * タイムスタンプ

### 2.2 ログ送信

* 送信先: FastAPIサーバー ( `https://tornado2025.chigayuki.com/upload/history` )
* 認証: `Authorization: Bearer <access_token>`
* 送信方式: `fetch` によるJSON POST
* 失敗時: リトライ or ローカル一時保存

### 2.3 認証

* Webアプリでログイン → JWT発行(OAuth2PasswordBearerなどを使ったシステムに全面移行)
* JWTは拡張機能の `chrome.storage.local` に保存
* 期限切れ検知時はリフレッシュ or 再ログインを要求
* ハッカソン中は簡易版として **パーソナルアクセストークン (固定JWT)** 方式もサポート

### 2.4 ignore設定

* ユーザーが指定したパターンと一致するURLは送信しない
* サーバー側でも同様にフィルタリング（セーフティネット）

**仕様:**

* パターン形式: 正規表現（ユーザーが直接入力）
* 簡易操作: 「現在のサイトを除外」ボタンでドメイン正規表現を自動追加
* 保存: `chrome.storage.local.ignorePatterns: string[]`

---

## 3. UI要件

### 3.1 ポップアップ

* **表示項目**

  * ログイン状態（ログイン済み / 未ログイン）
  * ログ送信のON/OFFスイッチ
  * 「現在のサイトを除外」ボタン
* **操作**

  * ログイン / ログアウト
  * 一時停止（送信停止）

### 3.2 オプションページ

* **表示項目**

  * 登録済みignoreパターン一覧
* **操作**

  * 正規表現パターンの追加/編集/削除
  * PATの入力欄

---

## 4. FastAPIサーバー要件

### 4.1 認証

* `OAuth2PasswordBearer` + JWT
* デコーダ例:

  ```python
  payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
  ```

* パーソナルアクセストークン（固定JWT）も発行可能

### 4.2 APIエンドポイント

* `POST /upload/history`

  * リクエストボディ例:

    ```json
    {
      "url": "https://example.com/article/1",
      "title": "Example Article",
      "description": "This is an example page",
      "timestamp": "2025-08-23T12:34:56Z"
    }
    ```

  * レスポンス: `{"status": "ok"}`

### 4.3 ignoreフィルタリング

* サーバーDBにユーザーごとのignoreパターンを保持
* 保存前にマッチングして除外

---

## 5. 保存・運用要件

* **拡張機能**

  * 設定: `chrome.storage.local`
  * ログ: 基本サーバー送信のみ（ローカルには残さない）
* **サーバー**

  * DB: ユーザーID・URL・タイトル・description・timestamp を保存
  * ignorePatterns はユーザーごとに管理

---

## 6. セキュリティ

* 通信はHTTPS必須（本番: `https://tornado2025.chigayuki.com`）
* JWTはStorageに保存するが、必要最小限で利用
* ignoreパターンはXSSやReDoSを避けるため、保存時にサニタイズ/制限を行う

---
