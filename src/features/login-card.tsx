import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

export type LoginCardProps = {
  email: string;
  password: string;
  loading?: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
};

export function LoginCard({ email, password, loading, onEmailChange, onPasswordChange, onSubmit }: LoginCardProps) {
  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">ログイン</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">メールアドレス</label>
              <Input type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">パスワード</label>
              <Input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "ログイン中..." : "ログイン"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
