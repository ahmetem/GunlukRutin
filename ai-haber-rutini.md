# AI Haber Bülteni Rutini

Bu dosya, günde 5 kez çalışan "Yapay Zeka Haber Bülteni" rutininin ne yaptığını ve
nasıl yapılandırıldığını açıklar.

Son güncelleme: 2026-07-16

## Amaç
Belirli saatlerde web'i tarayıp üç konuda YENİ gelişmeleri derler ve
Ahmet'e Gmail **taslağı** olarak hazırlar:

1. 🟣 **Claude & Anthropic** — Anthropic'ten yeni duyurular, Claude ile ilgili gelişmeler
2. 🧠 **Yapay Zeka Modelleri** — güncel LLM / model haberleri (OpenAI, Google, Meta, Mistral, xAI vb.)
3. 💻 **Öne Çıkan AI GitHub Repoları** — yükselen/başarılı yapay zeka projelerinin tanıtımı

## Yapılandırma
- **Zamanlama:** Europe/Istanbul saatiyle **08:00, 12:00, 14:00, 16:00, 20:00** (günde 5 kez).
  - Cron (UTC): `8 5,9,11,13,17 * * *` (İstanbul UTC+3; :00 yığılmasını önlemek için dakika :08'e alındı).
- **Gönderim:** Gmail **taslağı**, alıcı `posta@ahmetkaraca.com`.
  - Not: Bağlı Gmail bağlantısı yalnızca **taslak** oluşturabilir (otomatik "gönder" yoktur).
    Taslaklar Gmail → Taslaklar klasöründe belirir; okunabilir ya da tek tıkla gönderilebilir.
- **Tekrar önleme (dedup):** `ai-haber-gecmisi.json`, `claude/ai-news-github-routine-ax9twg` dalında tutulur.
  Rutin her çalışmada bu dosyayı okur, daha önce gönderilenleri eler, yenileri ekleyip push eder.
- **Ortam:** `env_012SHYoYh21csjVAKwCaZ9An` (Default), fresh-session-per-fire.

## Akış (rutin prompt'unun özeti)
0. Depoyu çek, `ai-haber-gecmisi.json`'u oku (yoksa boş kabul et).
1. Üç kategori için WebSearch ile son ~1-2 günün gelişmelerini topla (kategori başına 3-5 öğe).
2. Geçmişle karşılaştır, daha önce gönderilenleri ele. Yeni öğe yoksa taslak oluşturma.
3. **`mcp__Gmail__create_draft` aracını doğrudan çağırarak** HTML + düz metin e-posta taslağı oluştur
   (alıcı: `posta@ahmetkaraca.com`).
4. Yeni öğeleri geçmiş dosyasına ekle, commit + push et.
5. Kısa Türkçe özet ver (bu, yalnızca sohbet/bildirim metnidir — Gmail taslağı YERİNE geçmez).

### ⚠️ Önemli — otomatik dönüşüm YOK
"Son mesaj" olarak yazılan bülten metni **kendiliğinden Gmail taslağına dönüşmez**.
Tetikleyici (trigger) prompt'u ne yazarsa yazsın, e-postanın Taslaklar klasöründe
görünmesi için rutinin her çalışmasında **`mcp__Gmail__create_draft` aracının fiilen
çağrılması** şarttır. Yalnızca son mesaj yazıp/veya PushNotification göndermek yeterli
DEĞİLDİR — bu sadece uygulama içi bildirim/sohbet çıktısıdır, Gmail'e düşmez.
Trigger'ın prompt metni bu adımı ("create_draft'ı çağır") açıkça içermiyorsa,
Triggers ayarlarından prompt güncellenmelidir.

## İlkeler
- Uydurma haber/link YOK; yalnızca aramada gerçekten çıkan, doğrulanabilir kaynaklar.
- Aynı haber iki kez gönderilmez (dedup şart).
- Türkçe, kısa ve net.
