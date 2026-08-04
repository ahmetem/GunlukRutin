# AI Haberleri

Saatlik çalışan **AI Haber Bülteni** rutininin tüm dosyaları burada. Rutin web'i tarar,
daha önce gönderilmemiş gelişmeleri derler ve bülteni **doğrudan bu klasöre** yazar.

Son güncelleme: 2026-08-04

## Klasör haritası

| Yol | Ne işe yarar |
|---|---|
| [`ai-haber-rutini.md`](./ai-haber-rutini.md) | Rutinin ne yaptığı, nasıl yapılandırıldığı — teknik doküman |
| [`rutin-prompt.md`](./rutin-prompt.md) | Trigger ayarlarına yapıştırılacak güncel prompt metni |
| [`ai-haber-gecmisi.json`](./ai-haber-gecmisi.json) | Tekrar önleme (dedup) geçmişi — gönderilmiş her öğenin kaydı |
| [`Bultenler/`](./Bultenler/) | Üretilmiş tüm bültenler (`YYYY-AA-GG-SSDD.md`) + dizin |

## Nasıl çalışır (kısa)

1. `main` dalını çeker, `ai-haber-gecmisi.json`'u okur.
2. Üç kategoride son 1-2 günün gelişmelerini arar:
   🟣 Claude & Anthropic · 🧠 Yapay Zeka Modelleri · 💻 Öne Çıkan AI GitHub Repoları
3. Geçmişle karşılaştırıp daha önce gönderilenleri eler.
4. Yeni öğe varsa bülteni `Bultenler/` altına Markdown olarak yazar,
   `Bultenler/README.md` dizinini ve `ai-haber-gecmisi.json`'u günceller, `main`'e push eder.
5. Kısa bir özet bildirimi gönderir.

Yeni öğe yoksa hiçbir dosya yazılmaz ve bildirim gönderilmez.

## Değişiklik geçmişi

- **2026-08-04** — Gmail taslağı yerine GitHub'a yazma. Rutin `main` dalındaki bu klasöre
  taşındı; dedup dosyası `claude/ai-news-github-routine-ax9twg` dalından buraya alındı.
  16 Temmuz – 4 Ağustos arasında Gmail taslağı olarak üretilen 15 bülten
  `Bultenler/` altına arşivlendi.
- **2026-07-16** — Rutin kurulduğunda çıktı Gmail taslağı olarak hazırlanıyordu.
