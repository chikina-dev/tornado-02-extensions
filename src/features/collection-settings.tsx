import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { getLocal, setLocal } from "../utils/storage";

// UI only. No persistence or side effects.
export function CollectionSettings() {
  const [collectionEnabled, setCollectionEnabled] = useState(true);
  const [intervalEnabled, setIntervalEnabled] = useState(false);
  const [collectionInterval, setCollectionInterval] = useState(30);

  // 初期読み込み
  useEffect(() => {
    (async () => {
      const data = await getLocal([
        "isLoggingEnabled",
        "intervalModeEnabled",
        "intervalThresholdSec",
      ]);
      if (typeof data.isLoggingEnabled === "boolean") setCollectionEnabled(data.isLoggingEnabled);
      if (typeof data.intervalModeEnabled === "boolean") setIntervalEnabled(data.intervalModeEnabled);
      if (typeof data.intervalThresholdSec === "number") setCollectionInterval(data.intervalThresholdSec);
    })();
  }, []);

  // 変更保存
  useEffect(() => {
    void setLocal({ isLoggingEnabled: collectionEnabled });
  }, [collectionEnabled]);
  useEffect(() => {
    void setLocal({ intervalModeEnabled: intervalEnabled });
  }, [intervalEnabled]);
  useEffect(() => {
    if (Number.isFinite(collectionInterval)) {
      const v = Math.max(1, Math.min(3600, Math.round(collectionInterval)));
      void setLocal({ intervalThresholdSec: v });
    }
  }, [collectionInterval]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          収集設定
          <div className="flex items-center gap-2">
            <Switch checked={collectionEnabled} onCheckedChange={setCollectionEnabled} />
            <span className={`text-sm font-medium ${collectionEnabled ? "text-green-600" : "text-red-600"}`}>
              {collectionEnabled ? "収集中" : "停止中"}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          検索履歴の収集を{collectionEnabled ? "有効" : "無効"}にします。
        </p>

        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <Label htmlFor="interval-toggle" className="text-sm font-medium">
              収集間隔の設定
            </Label>
            <div className="flex items-center gap-2">
              <Switch id="interval-toggle" checked={intervalEnabled} onCheckedChange={setIntervalEnabled} />
              <span className={`text-sm ${intervalEnabled ? "text-green-600" : "text-gray-500"}`}>
                {intervalEnabled ? "ON" : "OFF"}
              </span>
            </div>
          </div>

          <div className={`space-y-3 ${!intervalEnabled ? "opacity-50 pointer-events-none" : ""}`}>
            <Label htmlFor="collection-interval" className="text-sm font-medium">
              収集間隔: {collectionInterval}秒
            </Label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                id="collection-interval"
                min={5}
                max={300}
                step={5}
                value={collectionInterval}
                onChange={(e) => setCollectionInterval(Number(e.target.value))}
                disabled={!intervalEnabled}
                className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer slider ${
                  !intervalEnabled ? "bg-gray-300" : "bg-muted"
                }`}
              />
              <Input
                type="number"
                min={5}
                max={300}
                step={5}
                value={collectionInterval}
                onChange={(e) => setCollectionInterval(Number(e.target.value))}
                disabled={!intervalEnabled}
                className="w-20 text-center"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5秒</span>
              <span>5分</span>
            </div>
            <p className="text-xs text-muted-foreground">
              設定は保存され、拡張機能の動作に反映されます。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
