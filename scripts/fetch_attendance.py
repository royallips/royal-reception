"""ロイヤル利用管理（Google Apps Script）から本日出勤を取得して attend.json に書き出す。

接続先は環境変数 ROYAL_URL / ROYAL_PASS（GitHub Actions では Secrets）から読む。
ローカルで動かす場合は config.local.json の royalUrl / royalPass でもよい。

本日出勤とみなす条件：
  - 今日（日本時間）の記録で、種類が「利用」または「振替」
  - 「ネット非掲載」「ダミー」は除外
中抜けがある場合は、最初の出勤時間〜最後の退勤時間で表示する。
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'attend.json')


def load_config():
    url = os.environ.get('ROYAL_URL', '').strip()
    pw = os.environ.get('ROYAL_PASS', '').strip()
    if not (url and pw):
        path = os.path.join(ROOT, 'config.local.json')
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                cfg = json.load(f)
            url = url or cfg.get('royalUrl', '').strip()
            pw = pw or cfg.get('royalPass', '').strip()
    if not (url and pw):
        sys.exit('ROYAL_URL / ROYAL_PASS が設定されていません')
    return url, pw


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def http_get(url):
    """GET する。Apps Script は googleusercontent へ 302 で転送するので、
    転送先は新しいリクエストとして取り直す（自動追従だと 404 になることがある）"""
    opener = urllib.request.build_opener(_NoRedirect)
    for _ in range(5):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 royal-reception'})
        try:
            with opener.open(req, timeout=60) as res:
                return res.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308) and e.headers.get('Location'):
                url = e.headers['Location']
                continue
            raise
    sys.exit('利用管理への転送が多すぎます')


def fetch_state(url, pw):
    q = urllib.parse.urlencode({'action': 'get', 'rev': 0, 'pass': pw})
    body = http_get(url + ('&' if '?' in url else '?') + q)
    try:
        j = json.loads(body)
    except ValueError:
        sys.exit('利用管理から JSON 以外が返りました（URL を確認してください）')
    if not j.get('ok'):
        sys.exit(f"利用管理の取得に失敗しました: {j.get('error')}")
    data = j['data']
    return json.loads(data) if isinstance(data, str) else data


def fmt_time(v):
    """'20.5' → '20:30'、'L'（ラスト）→ '24:00'"""
    s = str(v or '').strip()
    if s in ('L', '24', '24:00'):
        return '24:00'
    try:
        f = float(s)
    except ValueError:
        return s
    return f'{int(f)}:{int(round((f - int(f)) * 60)):02d}'


def to_hour(v):
    s = str(v or '').strip()
    if s == 'L':
        return 24.0
    try:
        return float(s)
    except ValueError:
        return 99.0


def main():
    url, pw = load_config()
    state = fetch_state(url, pw)
    today = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')
    names = {c['id']: c.get('name', '').strip() for c in state.get('casts', [])}

    rows = []
    for key, r in state.get('records', {}).items():
        if not key.endswith('_' + today) or not isinstance(r, dict) or r.get('_deleted'):
            continue
        if r.get('status') not in ('work', 'furikae') or not r.get('start'):
            continue
        if r.get('hideNet') or r.get('dummy'):
            continue
        name = names.get(key[:-len(today) - 1])
        if not name:
            continue
        start = r['start']
        end = r.get('end2') if r.get('start2') else r.get('end')
        end = end or 'L'
        rows.append({'name': name, 'start': fmt_time(start), 'end': fmt_time(end),
                     'shiftTime': f'{fmt_time(start)}〜{fmt_time(end)}', '_s': to_hour(start)})

    rows.sort(key=lambda x: (x['_s'], x['name']))
    for x in rows:
        del x['_s']
    # インバウンド対応・条件（利用表アプリで管理。一度も設定されていない間は出力しない）
    casts = state.get('casts', [])
    out = {'date': today, 'list': rows}
    if any('inbound' in c for c in casts):
        out['inbound'] = {c.get('name', '').strip(): c.get('inbMemo', '') or ''
                          for c in casts if c.get('inbound')}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{today} 本日出勤 {len(rows)}名')


if __name__ == '__main__':
    main()
