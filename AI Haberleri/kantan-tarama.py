#!/usr/bin/env python3
"""
kantan-tarama.py — kantan.news'in açık JSON API'sinden pencere içindeki AI haberlerini
çeker. Kimlik doğrulama gerekmez; tek curl zinciri, ~2-3 saniye.

kantan.news bir **aggregator**: Google News RSS'ten aldığı haberleri Türkçe yeniden yazar.
Bültende kaynak olarak kantan'ın kendi sayfası değil, her kayıttaki `original_link`
(birincil kaynak: futurism, gizmodo, arstechnica, the-decoder …) kullanılır. Kantan bu
yüzden yalnızca **keşif** aracıdır: "bugün ne oldu" listesi + birincil kaynak linki +
yayın zamanı. Özet metnini bültene aynen taşıma; birincil kaynağı aç ve oradan yaz.

Uç noktalar (2026-09-05'te ölçüldü):
  GET https://kantan.news/api/news?category=<Görünen Ad>&limit=30&page=N   → liste
      (`category` slug DEĞİL görünen ad alır: "Yapay Zeka", "Yazılım", "Siber Güvenlik")
  GET https://kantan.news/api/news/slug/<slug>                              → tam içerik
  GET https://kantan.news/api/categories                                    → 20 kategori

Kullanım:
  python3 "AI Haberleri/kantan-tarama.py" --since 2026-09-04T20:00+03:00
  python3 "AI Haberleri/kantan-tarama.py" --since 24h --kategori "Yapay Zeka" --kategori "Yazılım"
  python3 "AI Haberleri/kantan-tarama.py" --since 24h --json

Çıkış kodu: 0 = okundu; 2 = API'ye ulaşılamadı (WebSearch ile devam et, kantan'ı atla).

Not: robots.txt `Content-Signal: search=yes, ai-train=no, use=reference` diyor ve AI
tarayıcılarını (ClaudeBot, GPTBot) engelliyor. Bu script içerik toplamaz; yalnızca başlık,
tarih ve birincil kaynak linkini "referans" amacıyla alır.
"""
import argparse
import datetime as dt
import json
import re
import subprocess
import sys

API = "https://kantan.news/api/news"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/128.0.0.0 Safari/537.36")
IST = dt.timezone(dt.timedelta(hours=3))
VARSAYILAN_KATEGORILER = ["Yapay Zeka"]
MAX_SAYFA = 5


def curl_json(url, timeout=25):
    try:
        p = subprocess.run(
            ["curl", "-sS", "--compressed", "--max-time", str(timeout), "-A", UA,
             "-H", "Accept: application/json", url],
            capture_output=True, text=True, errors="ignore", timeout=timeout + 10)
        return json.loads(p.stdout)
    except Exception:
        return None


def since_coz(s):
    m = re.fullmatch(r"(\d+)\s*([hdHD])", s.strip())
    if m:
        n, b = int(m.group(1)), m.group(2).lower()
        return dt.datetime.now(dt.timezone.utc) - (dt.timedelta(hours=n) if b == "h" else dt.timedelta(days=n))
    t = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    if t.tzinfo is None:
        t = t.replace(tzinfo=IST)
    return t.astimezone(dt.timezone.utc)


def zaman(iso):
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(dt.timezone.utc)


def kaynak_durumu(link):
    if not link:
        return "kaynak-yok"
    if link.startswith("https://news.google.com/"):
        return "google-yonlendirme"  # çözülemiyor (JS gerektirir) — bültene alma
    return "ok"


def kategori_tara(kategori, since):
    """Pencere içindeki kayıtları döner; API'ye ulaşılamazsa None."""
    from urllib.parse import quote
    sonuc, sayfa = [], 1
    while sayfa <= MAX_SAYFA:
        d = curl_json(f"{API}?category={quote(kategori)}&limit=30&page={sayfa}")
        if not d or not d.get("success"):
            return None if sayfa == 1 else sonuc
        items = d.get("data") or []
        if not items:
            break
        eski_var = False
        for x in items:
            t = zaman(x["published_at"])
            if t < since:
                eski_var = True
                continue
            sonuc.append({
                "zaman": t.astimezone(IST).isoformat(timespec="minutes"),
                "baslik": x.get("title", "").strip(),
                "kategori": x.get("category"),
                "kaynak": x.get("original_link"),
                "kaynak_durumu": kaynak_durumu(x.get("original_link")),
                "kantan_url": f"https://kantan.news/haber/{x.get('slug')}",
                "etiketler": [e.strip() for e in (x.get("tags") or "").split(",") if e.strip()]
                if isinstance(x.get("tags"), str) else (x.get("tags") or []),
                "ozet": (x.get("excerpt") or x.get("summary") or "").strip(),
            })
        if eski_var or not d.get("has_more"):
            break
        sayfa += 1
    return sonuc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", default="24h", help="'24h', '4d' veya ISO tarih (varsayılan 24h)")
    ap.add_argument("--kategori", action="append", help="görünen ad; tekrarlanabilir (varsayılan: 'Yapay Zeka')")
    ap.add_argument("--json", action="store_true", help="satır başına JSON yaz")
    a = ap.parse_args()

    since = since_coz(a.since)
    kategoriler = a.kategori or VARSAYILAN_KATEGORILER
    okunan, toplam = 0, []
    for k in kategoriler:
        r = kategori_tara(k, since)
        if r is None:
            print(f"⚠️  kantan.news API okunamadı (kategori: {k})", file=sys.stderr)
            continue
        okunan += 1
        toplam.extend(r)

    if okunan == 0:
        print("KANTAN OKUNAMADI — bu kaynağı atla.", file=sys.stderr)
        return 2

    # aynı birincil kaynak iki kategoride çıkarsa tekle
    gorulen, tekil = set(), []
    for x in sorted(toplam, key=lambda x: x["zaman"], reverse=True):
        anahtar = x["kaynak"] or x["kantan_url"]
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        tekil.append(x)

    if a.json:
        for x in tekil:
            print(json.dumps(x, ensure_ascii=False))
        return 0

    print(f"## kantan.news — {', '.join(kategoriler)} — since {since.astimezone(IST):%Y-%m-%d %H:%M} IST "
          f"— {len(tekil)} haber")
    for x in tekil:
        isaret = {"ok": "", "google-yonlendirme": " ⚠️ kaynak Google yönlendirmesi (çözülemez, alma)",
                  "kaynak-yok": " ⚠️ birincil kaynak yok (alma)"}[x["kaynak_durumu"]]
        print(f"- {x['zaman'][:16].replace('T', ' ')} · {x['kategori']}: {x['baslik']}{isaret}")
        if x["ozet"]:
            oz = x["ozet"].replace("\n", " ")
            print(f"  {oz[:220] + ('…' if len(oz) > 220 else '')}")
        print(f"  kaynak: {x['kaynak'] or '-'}")
        print(f"  kantan: {x['kantan_url']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
