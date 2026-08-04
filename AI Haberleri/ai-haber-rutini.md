# AI Haber Bülteni Rutini

Bu dosya, saatlik çalışan "Yapay Zeka Haber Bülteni" rutininin ne yaptığını ve
nasıl yapılandırıldığını açıklar.

Son güncelleme: 2026-08-04

## Amaç
Belirli saatlerde web'i tarayıp üç konuda YENİ gelişmeleri derler ve bülteni
bu depodaki `AI Haberleri/Bultenler/` klasörüne Markdown dosyası olarak yazar:

1. 🟣 **Claude & Anthropic** — Anthropic'ten yeni duyurular, Claude ile ilgili gelişmeler
2. 🧠 **Yapay Zeka Modelleri** — güncel LLM / model haberleri (OpenAI, Google, Meta, Mistral, xAI vb.)
3. 💻 **Öne Çıkan AI GitHub Repoları** — yükselen/başarılı yapay zeka projelerinin tanıtımı

## Yapılandırma

- **Depo / dal:** `ahmetem/GunlukRutin`, **`main`** dalı.
- **Çalışma klasörü:** `AI Haberleri/`
- **Çıktı:** `AI Haberleri/Bultenler/YYYY-AA-GG-SSDD.md` (Europe/Istanbul saati).
  Her çalışma kendi dosyasını yazar; eski bültenler asla üzerine yazılmaz.
- **Arşiv dizini:** `AI Haberleri/Bultenler/README.md` — her çalışmada yeni satır eklenir.
- **Tekrar önleme (dedup):** `AI Haberleri/ai-haber-gecmisi.json`.
  Her kayıt: `{"url","baslik","kategori","tarih"}`. 30 günden eski kayıtlar budanır.
- **Bildirim:** Kısa Türkçe özet `PushNotification` ile gönderilir (telefon + e-posta).
- **Ortam:** `env_012SHYoYh21csjVAKwCaZ9An` (Default), fresh-session-per-fire.

### ⚠️ Gmail artık kullanılmıyor
Rutin 2026-08-04'e kadar çıktısını `mcp__Gmail__create_draft` ile Gmail **taslağı**
olarak hazırlıyordu. Bu yaklaşım her seferinde Ahmet'in taslağı açıp göndermesini
gerektiriyordu. Artık bülten doğrudan GitHub'a yazılıyor; **Gmail aracı çağrılmaz.**
16 Temmuz – 4 Ağustos 2026 arası üretilen 15 taslak `Bultenler/` altına arşivlendi.

## Akış (rutin prompt'unun özeti)

0. `git fetch/checkout/pull origin main`, `AI Haberleri/ai-haber-gecmisi.json`'u oku
   (yoksa `{"gonderilen": []}` kabul et).
1. Üç kategori için WebSearch ile son ~1-2 günün gelişmelerini topla (kategori başına 3-5 öğe).
2. Geçmişle karşılaştır: aynı URL veya çok benzer başlık → çıkar.
   Yeni öğe kalmadıysa **hiçbir dosya yazma**, bildirim gönderme, "Yeni AI haberi yok." yaz ve bitir.
3. Bülteni `AI Haberleri/Bultenler/YYYY-AA-GG-SSDD.md` olarak yaz.
4. `Bultenler/README.md` dizinine yeni bülten satırını ekle.
5. Yeni öğeleri `ai-haber-gecmisi.json`'a ekle, 30 günden eskileri buda.
6. `git add` → `commit` → `push origin main`. Push ağ hatası verirse 2s/4s/8s/16s ile 4 kez dene.
   Çakışma olursa `git pull --no-rebase origin main` sonra tekrar dene.
7. Kısa Türkçe özeti `PushNotification` ile gönder ve son mesaj olarak yaz.

## Bülten dosya biçimi

```markdown
# 🤖 AI Bülteni — <gün ay yıl>: <kısa özet>

**Tarih:** 4 Ağustos 2026, 16:21 (Europe/Istanbul)
**Kaynak:** AI Haber Bülteni rutini

---

## 🟣 Claude & Anthropic

- **<başlık>**
  <1-2 cümle Türkçe özet>
  <düz kaynak URL>

## 🧠 Yapay Zeka Modelleri
...
## 💻 Öne Çıkan AI GitHub Repoları
...
```

Yeni öğesi olmayan bölüm atlanır.

## İlkeler
- Uydurma haber/link YOK; yalnızca aramada gerçekten çıkan, doğrulanabilir kaynaklar.
  Linkler aynen iletilir (kısaltma/yönlendirme sarmalayıcısı eklenmez).
- Aynı haber iki kez gönderilmez (dedup şart).
- Türkçe, kısa ve net.
