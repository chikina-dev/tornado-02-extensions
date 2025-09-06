import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

export function WelcomeCard({ email, onLogout, loading = false }: { email: string; onLogout: () => void | Promise<void>; loading?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>ようこそ</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm">
          ようこそ、<span className="font-semibold">{email}</span> さん
        </p>
        <Button variant="destructive" onClick={onLogout} disabled={loading} aria-busy={loading}>
          {loading ? 'ログアウト中...' : 'ログアウト'}
        </Button>
      </CardContent>
    </Card>
  );
}
