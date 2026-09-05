# AI Haberleri

**AI Haber Bülteni** rutininin tüm dosyaları burada. Rutin web'i tarar, daha önce
gönderilmemiş gelişmeleri derler ve bülteni **doğrudan bu klasöre** yazar; n8n bültenleri
mail olarak iletir.

Son güncelleme: 2026-09-05

## Klasör haritası

| Yol | Ne işe yarar |
|---|---|
| [`ai-haber-rutini.md`](./ai-haber-rutini.md) | Rutinin ne yaptığı, nasıl yapılandırıldığı — teknik doküman |
| [`rutin-prompt.md`](./rutin-prompt.md) | claude.ai routine ayarına yapıştırılacak güncel prompt metni |
| [`kantan-tarama.py`](./kantan-tarama.py) | kantan.news JSON API'sinden pencere içi AI haberlerini birincil kaynak linkiyle listeleyen keşif scripti (Adım 2-B) |
| [`x-tarama.py`](./x-tarama.py) | X hesaplarının (@ClaudeDevs, @AnthropicAI, @sama, @OpenAI) son gönderilerini x.com + oembed'den çeken yardımcı script (Adım 3) |
| [`ai-haber-gecmisi.json`](./ai-haber-gecmisi.json) | Tekrar önleme (dedup) geçmişi — gönderilmiş her öğenin kaydı |
| [`Bultenler/`](./Bultenler/) | Üretilmiş tüm bültenler (`YYYY-AA-GG-SSDD.md`) + dizin + `latest.json` |
| [`n8n/`](./n8n/) | Bülteni mail olarak gönderen n8n workflow'u (CT 202) |

## Nasıl çalışır (kısa)

1. `main` dalını çeker, `ai-haber-gecmisi.json`'u budayarak okur (30 günden eskiyi atar).
2. Son bültenden pencereyi hesaplar (24 saat – 4 gün) ve üç kategoride gelişmeleri arar:
   🟣 Claude & Anthropic · 🧠 Yapay Zeka Modelleri · 💻 Öne Çıkan AI GitHub Repoları.
   Kaynaklar: web araması + GitHub trending + koşullu olarak `@ClaudeDevs`, `@AnthropicAI`,
   `@sama`, `@OpenAI` (X doğrudan okunamadığı için dolaylı — ayrıntı `ai-haber-rutini.md`).
3. İki katmanlı dedup (konu anahtarı + URL) ile daha önce gönderilenleri eler.
4. Yeni öğe ≥2 ise bülteni `Bultenler/` altına yazar, `Bultenler/README.md`,
   `Bultenler/latest.json` ve `ai-haber-gecmisi.json`'u günceller, `main`'e push eder.
5. n8n workflow'u yeni bülteni görüp mail olarak gönderir.

Yeni öğe <2 ise hiçbir dosya yazılmaz (tek başına yeten frontier/Anthropic/Claude Code
sürüm notu istisna). Rutin ayrı bir PushNotification göndermez.

## Değişiklik geçmişi

- **2026-09-05** — kantan.news B bölümü için keşif kaynağı olarak eklendi
  (`kantan-tarama.py`): sitenin açık JSON API'si okunuyor, bültene kantan'ın kendi
  sayfası değil `original_link`'teki birincil kaynak giriyor.
- **2026-09-05** — Adım 3 (X) yeniden test edildi. dailygram çalışıyor ama aggregator
  özeti veriyor ve `@AnthropicAI`'ı kapsamıyor; Nitter Ağustos 2026'da kapandı. Bulunan
  çalışan yol: `curl` + tarayıcı UA ile `x.com/<hesap>` (status ID'ler SSR'de geliyor,
  200) + Snowflake → tarih + `publish.x.com/oembed` (birebir metin, auth yok).
  `x-tarama.py` scripti eklendi; prompt'taki Adım 3 buna göre yazıldı (dailygram yalnız
  yedek).
- **2026-08-10** — Prompt elden geçirildi: iki katmanlı dedup (konu anahtarı + URL;
  changelog/release-notes sayfaları URL muafiyetiyle), 30 gün budama artık **zorunlu**,
  yayın tarihi **zorunlu**, "en az 2 yeni öğe" eşiği (frontier/Anthropic/Claude Code
  istisnasıyla), pencere son bültenden hesaplanır (frekanstan bağımsız), finans/piyasa
  haberleri ve düşük-değerli GitHub repoları elenir, push `PUSH_OK` ile doğrulanır.
  Ayrı **PushNotification kaldırıldı** — teslimatı n8n mail'i yapıyor. Prompt başına
  n8n'in dayandığı "değişmez sözleşmeler" (dosya adı biçimi, tek H1, klasör yolu) eklendi.
- **2026-08-04** — Kaynaklara dört resmî X hesabı eklendi: `@ClaudeDevs`, `@AnthropicAI`,
  `@sama`, `@OpenAI`. x.com doğrudan okunamadığı (HTTP 402) için çalışan yöntemler
  test edilip prompt'a yazıldı.
- **2026-08-04** — Gmail taslağı yerine GitHub'a yazma. Rutin `main` dalındaki bu klasöre
  taşındı; dedup dosyası `claude/ai-news-github-routine-ax9twg` dalından buraya alındı.
  16 Temmuz – 4 Ağustos arasında Gmail taslağı olarak üretilen 15 bülten
  `Bultenler/` altına arşivlendi.
- **2026-07-16** — Rutin kurulduğunda çıktı Gmail taslağı olarak hazırlanıyordu.
