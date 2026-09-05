#!/usr/bin/env python3
"""
x-tarama.py — X (Twitter) hesaplarının son gönderilerini dailygram'a bağımlı olmadan,
doğrudan X'in kendi uç noktalarından çeker. Kimlik doğrulama gerekmez.

Nasıl çalışır (2026-09-05'te ölçüldü):
  1. `curl` + tarayıcı User-Agent ile `https://x.com/<hesap>` → HTTP 200. Sayfa bir JS
     kabuğu olsa da sunucu tarafında render edilen kısımda hesabın son ~5-7 gönderisinin
     `/status/<id>` bağlantıları yer alıyor. (WebFetch aynı adrese 402 alır; curl almaz.)
  2. Status ID bir Snowflake'tir: (id >> 22) + 1288834974657 = gönderi zamanı (ms, UTC).
     Böylece hiçbir ek çağrı yapmadan pencere filtresi uygulanır.
  3. Pencere içindeki her ID için `https://publish.x.com/oembed?url=...&omit_script=1`
     → gönderinin **birebir metni**, yazarı ve tarihi (JSON). Bu birincil kaynaktır;
     dailygram'ın kendi yazdığı özet değildir.

Kullanım:
  python3 "AI Haberleri/x-tarama.py" --since 2026-09-04T20:00+03:00
  python3 "AI Haberleri/x-tarama.py" --since 24h            # son 24 saat
  python3 "AI Haberleri/x-tarama.py" --since 24h --json     # satır başına JSON
  python3 "AI Haberleri/x-tarama.py" --since 24h ClaudeDevs sama

Çıkış kodu: 0 = en az bir hesap okunabildi; 2 = hiçbir hesap okunamadı (X yolu kapanmış
olabilir → dailygram.me/x/<hesap> yedeğine dön).
"""
import argparse
import datetime as dt
import html
import json
import re
import subprocess
import sys

VARSAYILAN_HESAPLAR = ["ClaudeDevs", "AnthropicAI", "sama", "OpenAI"]
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/128.0.0.0 Safari/537.36")
SNOWFLAKE_EPOCH_MS = 1288834974657
IST = dt.timezone(dt.timedelta(hours=3))


def curl(url, timeout=25):
    """URL'i indirir; (http_kodu, gövde) döner. Hata halinde (0, '')."""
    try:
        p = subprocess.run(
            ["curl", "-sS", "--compressed", "--max-time", str(timeout), "-A", UA,
             "-w", "\n__HTTP__%{http_code}", url],
            capture_output=True, text=True, errors="ignore", timeout=timeout + 10)
    except Exception:
        return 0, ""
    out = p.stdout
    m = re.search(r"__HTTP__(\d{3})\s*$", out)
    if not m:
        return 0, out
    return int(m.group(1)), out[: m.start()]


def snowflake_zaman(status_id):
    ms = (int(status_id) >> 22) + SNOWFLAKE_EPOCH_MS
    return dt.datetime.fromtimestamp(ms / 1000, tz=dt.timezone.utc)


def since_coz(s):
    """'24h', '3d' veya ISO-8601 (saat dilimli/dilimsiz) → UTC datetime."""
    m = re.fullmatch(r"(\d+)\s*([hdHD])", s.strip())
    if m:
        n, birim = int(m.group(1)), m.group(2).lower()
        delta = dt.timedelta(hours=n) if birim == "h" else dt.timedelta(days=n)
        return dt.datetime.now(dt.timezone.utc) - delta
    t = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    if t.tzinfo is None:
        t = t.replace(tzinfo=IST)  # dilimsiz verilirse Europe/Istanbul say
    return t.astimezone(dt.timezone.utc)


def hesap_status_idleri(hesap):
    kod, govde = curl(f"https://x.com/{hesap}")
    if kod != 200:
        return kod, []
    idler = sorted(set(re.findall(r"/status/(\d{15,})", govde)), key=int)
    return kod, idler


def oembed(status_id):
    url = f"https://publish.x.com/oembed?url=https://x.com/i/status/{status_id}&omit_script=1"
    kod, govde = curl(url)
    if kod != 200:
        return None
    try:
        d = json.loads(govde)
    except json.JSONDecodeError:
        return None
    h = d.get("html", "")
    m = re.search(r"<p[^>]*>(.*?)</p>", h, re.S)
    metin = m.group(1) if m else ""
    metin = re.sub(r"<br\s*/?>", "\n", metin)
    metin = html.unescape(re.sub(r"<[^>]+>", "", metin)).strip()
    return {
        "yazar": d.get("author_name"),
        "yazar_url": d.get("author_url"),
        "url": d.get("url"),
        "metin": metin,
    }


def dailygram_yedek(hesap):
    """X yolu kapanırsa: dailygram sayfasındaki 'View on X' status bağlantıları."""
    kod, govde = curl(f"https://dailygram.me/x/{hesap}")
    if kod != 200:
        return kod, []
    return kod, sorted(set(re.findall(r"x\.com/[A-Za-z0-9_]+/status/(\d{15,})", govde)), key=int)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("hesaplar", nargs="*", default=VARSAYILAN_HESAPLAR)
    ap.add_argument("--since", default="24h", help="'24h', '4d' veya ISO tarih (varsayılan 24h)")
    ap.add_argument("--json", action="store_true", help="satır başına JSON yaz")
    ap.add_argument("--metin-yok", action="store_true", help="oembed çağırma, yalnız ID+tarih")
    a = ap.parse_args()

    since = since_coz(a.since)
    okunan_hesap = 0
    bulgular = []

    for hesap in a.hesaplar:
        kod, idler = hesap_status_idleri(hesap)
        kaynak = "x.com"
        if not idler:
            kod2, idler = dailygram_yedek(hesap)
            kaynak = "dailygram"
            if not idler:
                print(f"⚠️  @{hesap}: okunamadı (x.com HTTP {kod}, dailygram HTTP {kod2})", file=sys.stderr)
                continue
        okunan_hesap += 1
        en_yeni = snowflake_zaman(idler[-1])
        pencerede = [i for i in idler if snowflake_zaman(i) >= since]
        if not a.json:
            print(f"\n## @{hesap}  ({kaynak}: {len(idler)} gönderi görüldü, en yeni "
                  f"{en_yeni.astimezone(IST):%Y-%m-%d %H:%M} IST, pencerede {len(pencerede)})")
        for sid in pencerede:
            z = snowflake_zaman(sid).astimezone(IST)
            kayit = {"hesap": hesap, "id": sid, "zaman": z.isoformat(timespec="minutes"),
                     "url": f"https://x.com/{hesap}/status/{sid}", "kaynak": kaynak}
            if not a.metin_yok:
                oe = oembed(sid)
                if oe:
                    kayit.update(oe)
                    if oe["yazar_url"] and oe["yazar_url"].rstrip("/").split("/")[-1].lower() != hesap.lower():
                        kayit["not"] = "başka hesabın gönderisi (alıntı/RT olabilir)"
                else:
                    kayit["metin"] = None
                    kayit["not"] = "oembed alınamadı"
            bulgular.append(kayit)
            if a.json:
                print(json.dumps(kayit, ensure_ascii=False))
            else:
                m = (kayit.get("metin") or "(metin alınamadı)").replace("\n", " ")
                if len(m) > 280:
                    m = m[:277] + "…"
                yazar = kayit.get("yazar")
                etiket = f" — {yazar}" if yazar else ""
                print(f"- {z:%Y-%m-%d %H:%M}{etiket}: {m}")
                print(f"  {kayit['url']}")
                if kayit.get("not"):
                    print(f"  ⚠️ {kayit['not']}")

    if okunan_hesap == 0:
        print("HİÇBİR HESAP OKUNAMADI — X yolu kapanmış olabilir.", file=sys.stderr)
        return 2
    if not a.json:
        print(f"\nToplam pencere içi gönderi: {len(bulgular)} "
              f"(since {since.astimezone(IST):%Y-%m-%d %H:%M} IST)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
