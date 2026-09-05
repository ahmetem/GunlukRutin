# AI Haber Bülteni Rutini

Bu dosya, "Yapay Zeka Haber Bülteni" rutininin ne yaptığını ve nasıl yapılandırıldığını
açıklar.

Son güncelleme: 2026-08-10

## Amaç
Her çalışmada web'i (ve koşullu olarak birkaç resmî X hesabını) tarayıp üç konuda YENİ
gelişmeleri derler ve bülteni bu depodaki `AI Haberleri/Bultenler/` klasörüne Markdown
dosyası olarak yazar:

1. 🟣 **Claude & Anthropic** — Anthropic duyuruları, Claude / Claude Code gelişmeleri
2. 🧠 **Yapay Zeka Modelleri** — güncel LLM / model haberleri (OpenAI, Google, Meta, Mistral, xAI…)
3. 💻 **Öne Çıkan AI GitHub Repoları** — yükselen/başarılı yapay zeka projelerinin tanıtımı

## Yapılandırma

- **Depo / dal:** `ahmetem/GunlukRutin`, **`main`** dalı.
- **Çalışma klasörü:** `AI Haberleri/`
- **Çıktı:** `AI Haberleri/Bultenler/YYYY-AA-GG-SSDD.md` (Europe/Istanbul saati).
  Her çalışma kendi dosyasını yazar; eski bültenler asla üzerine yazılmaz.
- **Arşiv dizini:** `AI Haberleri/Bultenler/README.md` — her çalışmada yeni satır eklenir.
- **n8n işaretçisi:** `AI Haberleri/Bultenler/latest.json` — her çalışmada üzerine yazılır.
  **Aktif n8n sürümü (v2) bu dosyaya bakmaz** — o `Bultenler/` klasörünü listeler; ama
  dosya v1 rollback'i için hâlâ yazılır. (Yazma adımının 6 Ağustos'ta prompt'tan düşmesi
  10 Ağustos'ta v1'in mail atmamasına yol açmıştı — ayrıntı: [`n8n/README.md`](./n8n/README.md).)
- **Mail:** n8n workflow'u (CT 202) `Bultenler/` klasörünü saat başı :25'te GitHub Contents
  API ile listeler, yeni bir bülten görürse Markdown'ı HTML'e çevirip
  `posta@ahmetkaraca.com` adresine **mail olarak gönderir**. Rutin ayrı bildirim
  (PushNotification) göndermez; teslimatı n8n yapar. Workflow: [`n8n/`](./n8n/).
- **Tekrar önleme (dedup):** `AI Haberleri/ai-haber-gecmisi.json`. Her kayıt
  **beş alan**: `{"url","baslik","kategori","tarih","anahtar"}`. `anahtar` konu slug'ıdır
  (bkz. aşağıda). 30 günden eski kayıtlar her çalışmada budanır (dosya ~166 KB'a ulaştı;
  budama artık zorunlu, bağlama tümüyle okunmaz).
- **Ortam:** `env_012SHYoYh21csjVAKwCaZ9An` (Default), fresh-session-per-fire.

### Frekanstan bağımsız pencere
Prompt "saatlik / günde N kez" varsaymaz. Her çalışma, **son bültenin zaman
damgasından** bu ana kadar olan pencereyi hesaplar (en az 24 saat, en çok 4 gün).
Rutin bir süre çalışmazsa kaçanlar toplanır; ama 4 günden eskiye inip arkeoloji
yapılmaz. Böylece zamanlama değişse de prompt doğru kalır.

### İki katmanlı dedup — neden
Eski sürüm yalnızca URL'e bakıyordu; aynı gelişme farklı sitede farklı URL ile
çıktığında iki kez gönderiliyordu (ölçüldü: 10 Ağustos'ta "Claude Code auto mode"
gelişmesi TechCrunch ve helpnetsecurity linkleriyle iki ayrı bültende gitti). Artık:
1. **Konu katmanı:** her aday için `sirket-urun-eylem` biçiminde bir **konu anahtarı**
   üretilir; son 7 günün anahtarlarıyla *aynı olay* eşleşirse elenir (slug birebir aynı
   olmak zorunda değil).
2. **URL katmanı:** adayların URL'leri tek `grep -F` çağrısıyla geçmişte aranır.
   `code.claude.com/.../changelog` ve `platform.claude.com/.../release-notes` gibi
   *sürekli güncellenen sabit sayfalar* bu katmandan muaftır (yoksa bir kez kullanılınca
   bir daha hiç kullanılamazlardı) — onlarda karar konu anahtarına bırakılır.

### Eşik ve hacim
- **2'den az yeni öğe** kalırsa bülten yazılmaz; öğeler birikip sonraki çalışmada gider.
  İstisna (tek başına yeter): yeni frontier model sürümü, Anthropic ürün/fiyat duyurusu,
  Claude Code'da davranış değiştiren/kırılgan sürüm notu.
- Bülten başına **en çok 8 öğe** (bölüm başına 3). Finans/piyasa haberleri (hisse, yatırım
  turu, derecelendirme, veri merkezi ekonomisi) bir modeli/aracı doğrudan etkilemiyorsa
  elenir. GitHub tarafında "awesome-*" listeleri, persona/skill koleksiyonları, klon ve
  yalnız-README repolar alınmaz.

## Kaynaklar

**Web araması:** anthropic.com/news, code.claude.com/docs/en/changelog,
platform.claude.com/docs/en/release-notes/overview, openai.com, the-decoder, TechCrunch,
VentureBeat vb. + GitHub trending.

**X (Twitter) — ek kaynak:** `@ClaudeDevs`, `@AnthropicAI`, `@sama`, `@OpenAI`.
Dört hesap tek Bash çağrısıyla okunur: [`x-tarama.py`](./x-tarama.py) (kimlik
doğrulama yok, ~4 s). Yöntem:

1. `curl` + tarayıcı User-Agent + `--compressed` ile `x.com/<hesap>` → HTTP 200. Sayfa
   JS kabuğu olsa da sunucu tarafında render edilen kısımda son ~5-7 gönderinin
   `/status/<id>` bağlantıları var. (WebFetch aynı adrese 402 alır, curl almaz.)
2. Status ID Snowflake'tir: `(id >> 22) + 1288834974657` = yayın zamanı (ms, UTC) →
   pencere filtresi ek çağrı gerektirmez.
3. Pencere içindeki her ID için `publish.x.com/oembed?url=...&omit_script=1` →
   gönderinin **birebir metni**, yazarı ve tarihi (JSON, auth yok). Birincil kaynaktır.
4. x.com okunamazsa script dailygram'a kendisi düşer; o da okunamazsa çıkış kodu 2.

Yollar (2026-09-05'te yeniden ölçüldü):

| Yol | Sonuç |
|---|---|
| `curl -A <Chrome UA> --compressed x.com/<hesap>` | ✅ HTTP 200, son 5-7 status ID (4 hesap da) |
| `curl publish.x.com/oembed?url=https://x.com/i/status/<id>` | ✅ HTTP 200, birebir metin + tarih |
| WebFetch `x.com/<hesap>` | ❌ HTTP 402 |
| WebFetch/curl `dailygram.me/x/<hesap>` | ✅ ClaudeDevs, sama, OpenAI — ama aggregator özeti; AnthropicAI 404 (yalnız yedek) |
| `nitter.net` ve diğer Nitter'lar | ❌ 24 Ağustos 2026 X Corp. cease-and-desist, proje durdu |
| `xcancel.com` | ❌ bot doğrulama |
| `r.jina.ai/https://x.com/...` | ❌ HTTP 401 |
| `syndication.twitter.com/srv/timeline-profile/...` | ❌ HTTP 429 |
| `rsshub.app/twitter/user/...` | ❌ HTTP 404 |
| sotwe / twstalker / lightbrd / twiiit | ❌ HTTP 403 |

Kaynak link olarak orijinal `x.com/<hesap>/status/<id>` verilir; iddia bültene girmeden
önce birincil kaynakla (blog/changelog/model kartı) karşılaştırılır. Alıntı/RT satırları
scriptte `⚠️ başka hesabın gönderisi` notuyla işaretlenir. X kaynaklı öğeler ayrı bölüm
açmaz; üç bölüme dağılır ve başlık sonuna hesap etiketi eklenir (örn. `… (@sama)`).

## Akış (rutin prompt'unun özeti)

0. `git fetch/checkout/pull origin main`; `ai-haber-gecmisi.json`'u **budayarak** oku
   (30 günden eskiyi at, son 7 günün anahtarlarını çıkar). python3 yoksa yalnız URL katmanı.
1. Son bülten damgasından pencereyi belirle (24 saat – 4 gün).
2. Üç kategori için WebSearch (kategori başına ≤3 arama, ≤3 öğe); her öğede yayın tarihi zorunlu.
3. X hesaplarını `x-tarama.py --since <pencere başı>` ile tara (tek Bash çağrısı).
4. İki katmanlı dedup (konu anahtarı + URL grep) ile tekrarları ele.
5. Kalan yeni öğe <2 ise **hiçbir dosya yazma**, "Yeni AI haberi yok" de, bitir (istisna hariç).
6. Bülteni `Bultenler/YYYY-AA-GG-SSDD.md` olarak yaz; `Bultenler/README.md` ve
   `Bultenler/latest.json`'u güncelle.
7. Yeni öğeleri (5 alanla) `ai-haber-gecmisi.json`'a ekle; `git add/commit/push` +
   `PUSH_OK` doğrula. Son mesajda kısa özet + dosya yolu.

## Bülten dosya biçimi

```markdown
# 🤖 AI Bülteni — <gün ay yıl>: <kısa özet>

**Tarih:** 11 Ağustos 2026, 08:05 (Europe/Istanbul)
**Kaynak:** AI Haber Bülteni rutini

---

## 🟣 Claude & Anthropic

- **<başlık>** — <kaynak alan adı> · <yayın tarihi>
  <1-2 cümle Türkçe özet>
  <düz kaynak URL>

## 🧠 Yapay Zeka Modelleri
...
## 💻 Öne Çıkan AI GitHub Repoları
...
```

En önemli tek öğeye `🔥`; aksiyon gerektiren öğeye tek satır `**Neden önemli:**`.
Yeni öğesi olmayan bölüm atlanır.

## İlkeler
- Uydurma haber/link/sayı YOK; yalnızca aramada çıkan, açılabilen kaynaklar. Linkler
  aynen iletilir. Tarihsiz öğe alınmaz.
- Aynı gelişme iki kez gönderilmez (iki katmanlı dedup şart).
- Kotayı doldurmak için marjinal/eski haber eklenmez — az ve doğru.
- Türkçe, kısa ve net.
