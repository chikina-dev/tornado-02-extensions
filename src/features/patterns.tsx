import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { getLocal, setLocal } from "../utils/storage";

export function PatternsCard() {
  const [patterns, setPatterns] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState("");
  const [mode, setMode] = useState<"blacklist" | "whitelist">("blacklist");

  useEffect(() => {
    (async () => {
      const data = await getLocal({ ignorePatterns: [], filterMode: "blacklist" });
      setPatterns(Array.isArray(data.ignorePatterns) ? data.ignorePatterns : []);
      setMode(data.filterMode === "whitelist" ? "whitelist" : "blacklist");
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
      setNewPattern("");
    }
  };

  const handleRemovePattern = (patternToRemove: string) => {
    savePatterns(patterns.filter((p) => p !== patternToRemove));
  };

  const handleModeChange = async (newMode: "blacklist" | "whitelist") => {
    setMode(newMode);
    await setLocal({ filterMode: newMode });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>URL フィルタ設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>フィルタータイプ</Label>
          <Tabs value={mode} onValueChange={(v) => handleModeChange(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="blacklist">ブラックリスト</TabsTrigger>
              <TabsTrigger value="whitelist">ホワイトリスト</TabsTrigger>
            </TabsList>
            <TabsContent value="blacklist" className="text-sm text-muted-foreground">
              パターンに一致するURLは記録しません。
            </TabsContent>
            <TabsContent value="whitelist" className="text-sm text-muted-foreground">
              パターンに一致するURLのみ記録します。
            </TabsContent>
          </Tabs>
        </div>

        <form onSubmit={handleAddPattern} className="flex gap-2">
          <Input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="正規表現パターン（例: ^https?://example\\.com/）"
          />
          <Button type="submit">追加</Button>
        </form>

        <div className="space-y-2">
          {patterns.length === 0 && (
            <p className="text-sm text-muted-foreground">パターンが登録されていません。</p>
          )}
          <ul className="space-y-2">
            {patterns.map((pattern) => (
              <li key={pattern} className="flex items-center justify-between border rounded-md px-3 py-2">
                <span className="font-mono text-sm break-all">{pattern}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => handleRemovePattern(pattern)}>
                  削除
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
