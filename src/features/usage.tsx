import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export function UsageCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>使い方</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc pl-5 space-y-2 text-sm">
          <li>まずは「ログイン」してください。メール・パスワードを保存して次回以降の入力を省略できます。</li>
          <li>記録対象は「ブラックリスト／ホワイトリスト」で制御します。正規表現でパターンを登録できます。</li>
          <li>ポップアップから「このサイトをブラック/ホワイトに追加」で、開いているサイトを一発登録できます。</li>
          <li>ログ送信を一時停止したい場合は、ポップアップの「ログ送信」をオフにしてください。</li>
          <li>認証エラーや未認証のときは通知されます。再ログインを実施すると復旧します。</li>
          <li>
            例: ドメイン単位で除外 → <span className="font-mono">^https?://example\\.com/.*</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
