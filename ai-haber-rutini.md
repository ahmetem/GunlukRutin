# AI Haber Bülteni Rutini

Bu dosya, saatlik çalışan "Yapay Zeka Haber Bülteni" rutininin ne yaptığını ve
nasıl yapılandırıldığını açıklar.

Son güncelleme: 2026-07-14

## Amaç
Her saat (gündüz saatlerinde) web'i tarayıp üç konuda YENİ gelişmeleri derler ve
Ahmet'e Gmail **taslağı** olarak hazırlar:

1. 🟣 **Claude & Anthropic** — Anthropic'ten yeni duyurular, Claude ile ilgili gelişmeler
2. 🧠 **Yapay Zeka Modelleri** — güncel LLM / model haberleri (OpenAI, Google, Meta, Mistral, xAI vb.)
3. 💻 **Öne Çıkan AI GitHub Repoları** — yükselen/başarılı yapay zeka projelerinin tanıtımı

## Yapılandırma
- **Zamanlama (cron, UTC):** `17 5-21 * * *` → Europe/Istanbul saatiyle **08:17–24:17 arası her saat** (günde 17 kez).
- **Gönderim:** **Uygulama bildirimi (push)**. Rutin tamamlanınca özet, Claude uygulamasının
  bildirimi olarak telefona düşer; tam bülteni açtığında (oturumun son mesajında) görürsün.
- **Tekrar önleme (dedup):** `ai-haber-gecmisi.json`, `claude/ai-news-github-routine-ax9twg` dalında tutulur.
  Rutin her çalışmada bu dosyayı okur, daha önce gönderilenleri eler, yenileri ekleyip push eder.
- **Ortam:** `env_012SHYoYh21csjVAKwCaZ9An` (Default), fresh-session-per-fire, `notifications.push = true`.

## Akış (rutin prompt'unun özeti)
0. Depoyu çek, `ai-haber-gecmisi.json`'u oku (yoksa boş kabul et).
1. Üç kategori için WebSearch ile son ~1-2 günün gelişmelerini topla (kategori başına 3-5 öğe).
2. Geçmişle karşılaştır, daha önce gönderilenleri ele. Yeni öğe yoksa bülten üretme.
3. Yeni öğeleri geçmiş dosyasına ekle, commit + push et.
4. Son mesaj olarak düzenli Türkçe bülteni yaz (ilk satır kısa başlık = bildirim önizlemesi).

## İlkeler
- Uydurma haber/link YOK; yalnızca aramada gerçekten çıkan, doğrulanabilir kaynaklar.
- Aynı haber iki kez gönderilmez (dedup şart).
- Türkçe, kısa ve net.
