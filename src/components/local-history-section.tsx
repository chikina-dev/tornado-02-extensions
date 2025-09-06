import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

type HistoryRow = {
  timestamp: string;
  url: string;
  title: string;
  description: string;
  domain: string;
};

const requestLocalCsv = async (): Promise<{ csv: string; lineCount: number }> =>
  new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: 'getLocalHistoryCsv' }, (res) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!res?.ok) return resolve({ csv: '', lineCount: 0 });
        resolve({ csv: res.csv ?? '', lineCount: res.lineCount ?? 0 });
      });
    } catch (e) {
      reject(e);
    }
  });

export function LocalHistorySection() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [errorRows, setErrorRows] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const parseCsv = (csv: string): string[][] => {
    // Robust CSV parser that supports quoted fields, escaped quotes (""), and newlines within quotes.
    if (!csv || csv.length === 0) return [];
    const rows: string[][] = [];
    let row: string[] = [];
    let cur = '';
    let inQuotes = false;

    const pushField = () => {
      row.push(cur);
      cur = '';
    };
    const pushRow = () => {
      // Avoid pushing trailing empty line if there's no data at all
      rows.push(row);
      row = [];
    };

    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i];
      if (inQuotes) {
        if (ch === '"') {
          // Escaped quote inside a quoted field
          if (csv[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          pushField();
        } else if (ch === '\n' || ch === '\r') {
          // Handle CRLF (\r\n) and lone CR or LF
          // If CRLF, skip the next \n
          // Push field and row only if there's any data or if we already have fields
          pushField();
          pushRow();
          if (ch === '\r' && csv[i + 1] === '\n') i++;
        } else {
          cur += ch;
        }
      }
    }

    // Push the last field/row if anything remains
    pushField();
    // Avoid adding an extra empty row when the CSV ends with a newline
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      pushRow();
    }

    // Filter out any completely empty rows (can occur if file had trailing newlines)
    return rows.filter((r) => r.some((c) => c !== ''));
  };

  const toDomain = (u: string): string => {
    try {
      return new URL(u).hostname || '';
    } catch {
      return '';
    }
  };

  const loadLocalRows = async () => {
    setLoadingRows(true);
    setErrorRows(null);
    try {
      const { csv } = await requestLocalCsv();
      const table = parseCsv(csv);
      if (table.length === 0) {
        setRows([]);
        setPage(1);
        return;
      }
  const header = table[0];
      const idx = {
        timestamp: header.indexOf('timestamp'),
        url: header.indexOf('url'),
        title: header.indexOf('title'),
        description: header.indexOf('description'),
      };
      const body = table.slice(1);
      const mapped: HistoryRow[] = body.map((r) => {
        const url = r[idx.url] ?? '';
        return {
          timestamp: r[idx.timestamp] ?? '',
          url,
          title: r[idx.title] ?? '',
          description: r[idx.description] ?? '',
          domain: toDomain(url),
        };
      });
      setRows(mapped);
      setPage(1);
    } catch (e: any) {
      setErrorRows(e?.message ?? '読み込みに失敗しました');
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    void loadLocalRows();
  }, []);

  const normalized = q.trim().toLowerCase();
  const startIso = dateFrom ? new Date(dateFrom).toISOString() : '';
  const endIso = dateTo ? new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString() : '';
  const filtered = rows
    .filter((r) => (domain ? r.domain === domain : true))
    .filter((r) => {
      if (!normalized) return true;
      const text = `${r.title}\n${r.domain}\n${r.url}\n${r.description}`.toLowerCase();
      return text.includes(normalized);
    })
    .filter((r) => (startIso ? r.timestamp >= startIso : true))
    .filter((r) => (endIso ? r.timestamp <= endIso : true))
    .sort((a, b) => (sortDesc ? (a.timestamp > b.timestamp ? -1 : 1) : a.timestamp > b.timestamp ? 1 : -1));

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const domains = Array.from(new Set(rows.map((r) => r.domain).filter(Boolean))).sort();

  const handleDownloadCsv = async () => {
    const { csv, lineCount } = await requestLocalCsv();
    if (!csv || lineCount === 0) {
      alert('ローカル履歴はありません。');
      return;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `history-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleClearCsv = async () => {
    await new Promise<void>((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'clearLocalHistoryCsv' }, () => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
    alert('ローカル履歴CSVをクリアしました。');
    void loadLocalRows();
  };

  return (
    <>
      <div className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">検索履歴</CardTitle>
              <CardDescription>ローカルに保存された履歴をテーブル表示します（最新{pageSize}件/ページ）。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadLocalRows()}>再読み込み</Button>
              <Button variant="outline" onClick={() => setSortDesc((s) => !s)}>{sortDesc ? '新→旧' : '旧→新'}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs text-muted-foreground">キーワード</Label>
                <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="タイトル/URL/説明を検索" className="mt-1" />
              </div>
              <div className="min-w-52">
                <Label className="text-xs text-muted-foreground mb-1 block">ドメイン</Label>
                <Select value={domain} onValueChange={(v) => { setDomain(v === '__ALL__' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="すべて" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">すべて</SelectItem>
                    {domains.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">開始日</Label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">終了日</Label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="mt-1" />
              </div>
              <div className="ml-auto text-sm text-muted-foreground">{filtered.length}件中 {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filtered.length)} を表示</div>
            </div>

            <div className="overflow-auto rounded border border-border">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 w-32">日時</th>
                    <th className="px-3 py-2 w-56">タイトル</th>
                    <th className="px-3 py-2 w-56">URL</th>
                    <th className="px-3 py-2 w-[36rem]">説明</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRows && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">読み込み中...</td></tr>
                  )}
                  {!loadingRows && pageRows.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">履歴がありません</td></tr>
                  )}
                  {!loadingRows && pageRows.map((r, i) => (
                    <tr key={`${r.timestamp}-${i}`} className="odd:bg-muted/30">
                      <td className="px-3 py-2 align-top whitespace-nowrap">{new Date(r.timestamp).toLocaleString()}</td>
                      <td className="px-3 py-2 align-top"><div className="line-clamp-2 break-words">{r.title || <span className="text-muted-foreground">(no title)</span>}</div></td>
                      <td className="px-3 py-2 align-top">
                        {r.url ? (
                          <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                            <a href={r.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{r.url}</a>
                          </div>
                        ) : <span className="text-muted-foreground">(no url)</span>}
                      </td>
                      <td className="px-3 py-2 align-top"><div className="break-words text-muted-foreground line-clamp-3 text-[0.8em]">{r.description ? r.description.replace(/\s+/g, ' ') : <span className="text-muted-foreground">(no description)</span>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <div className="text-sm text-white/60">ページ {safePage} / {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>前へ</Button>
              <Button variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>次へ</Button>
            </div>
          </CardFooter>
          {errorRows && <div className="px-6 pb-4 text-sm text-destructive/80">{errorRows}</div>}
        </Card>
      </div>

      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ローカル履歴CSV</CardTitle>
            <CardDescription>アップロードした履歴をCSV形式でローカルに蓄積しています。必要に応じてダウンロード/クリアできます。</CardDescription>
          </CardHeader>
          <CardFooter className="gap-3">
            <Button onClick={() => void handleDownloadCsv()}>CSVをダウンロード</Button>
            <Button variant="destructive" onClick={() => void handleClearCsv()}>CSVをクリア</Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}

export default LocalHistorySection;
