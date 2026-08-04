# n8n — AI Bültenini mail olarak gönder

`ai-bulteni-mail-gonder.json` — n8n'e içe aktarılacak workflow. Eski
**"AI Haber Bülteni - Taslağı Otomatik Gönder"** workflow'unun yerini alır.

n8n: CT 202, `192.168.1.24:5678`, dışarıdan `https://n8n.ahmetkaraca.com`.

## Ne değişti

| | Eski | Yeni |
|---|---|---|
| Kaynak | Gmail **taslağı** (rutin taslak oluşturuyordu) | GitHub'daki bülten dosyası |
| Tetikleyici | Zamanlı → taslakları listele | Zamanlı → `Bultenler/latest.json` |
| Tekrar önleme | Taslak silinir/etiketlenir | Workflow static data (`sonGonderilen`) |
| Gövde | Taslağın gövdesi | Markdown → HTML çevrimi |
| Gmail izni | Taslak okuma + gönderme | Yalnızca **gönderme** |

Rutin artık Gmail'e hiç dokunmuyor; bülteni `main` dalındaki
`AI Haberleri/Bultenler/` klasörüne yazıyor ve her çalışmada
`Bultenler/latest.json` işaretçisini güncelliyor.

## Akış

```
Her saat :25'te kontrol et  (Schedule Trigger, 25 * * * *)
  → latest.json çek         (HTTP, raw.githubusercontent + cache-buster, text)
  → Yeni bülten var mı?     (Code, JSON.parse + static data ile karşılaştır)
  → Yeni ise devam          (IF)
      ├─ true  → Bülteni indir (HTTP, text) → Markdown → HTML
      │          → Mail gönder (Gmail) → Gönderildi olarak işaretle (Code)
      └─ false → Yeni bülten yok - bitir (NoOp)
```

`latest.json` biçimi (rutin yazar):

```json
{
  "dosya": "2026-08-04-1621.md",
  "baslik": "🤖 AI Bülteni — 4 Ağustos 2026: …",
  "tarih": "2026-08-04T16:21:00+03:00",
  "url": "https://raw.githubusercontent.com/ahmetem/GunlukRutin/main/AI%20Haberleri/Bultenler/2026-08-04-1621.md"
}
```

## Kurulum

1. n8n → **Workflows** → **Import from File** → `ai-bulteni-mail-gonder.json`.
2. **Mail gönder** düğümünü aç, Gmail kimlik bilgisini (credential) elle seç —
   içe aktarma kimlik bilgilerini taşımaz.
3. Zamanlamayı kontrol et: `25 * * * *` — **her saat** :25. Rutin saatlik çalıştığı
   için kontrol de saatlik olmak zorunda; günde birkaç sabit saate düşürülürse
   aradaki bültenler hiç postalanmaz. Yeni bülten yoksa dedup sayesinde mail gitmez,
   yani saatlik kontrol fazladan e-posta üretmez.
4. **Execute Workflow** ile bir kez elle çalıştır. İlk çalıştırmada static data boş
   olduğu için en güncel bülten gönderilir — beklenen davranış.
5. Çalıştığını gördükten sonra workflow'u **Active** yap ve eski
   *"AI Haber Bülteni - Taslağı Otomatik Gönder"* workflow'unu **deaktive et**
   (silmeden önce bir süre kapalı tutmak güvenli).

## Notlar

- **Repo public**, bu yüzden workflow'da GitHub kimlik bilgisi/token yok;
  `raw.githubusercontent.com` doğrudan okunuyor. Repo private'a çevrilirse
  iki HTTP düğümüne token eklemek gerekir.
- `raw.githubusercontent.com` yanıtları ~5 dakika CDN'de önbelleklenir; bu yüzden
  iki HTTP düğümünde de `?cb={{ $now.toMillis() }}` cache-buster var.
- ⚠️ **`raw.githubusercontent.com`, `.json` dosyalarını bile
  `content-type: text/plain; charset=utf-8` ile servis eder.** HTTP düğümü
  otomatik algılamada bırakılırsa gövde nesne değil **string** olarak gelir ve
  `item.dosya` `undefined` olur → *"latest.json okunamadi veya eksik"*. Bu yüzden
  **latest.json çek** düğümü `responseFormat: text` + `fullResponse: true` ile
  çalışır ve JSON, sonraki Code düğümünde `JSON.parse` ile elle ayrıştırılır.
  Bu düğümün yanıt biçimini değiştirirken bunu bozma.
- Code düğümü artık hatayı ayırt ediyor: HTTP durumu 200 değilse
  *"latest.json cekilemedi (HTTP …)"*, gövde bozuksa
  *"JSON olarak ayristirilamadi: …"*, alan eksikse *"eksik alan iceriyor"* —
  her üçünde de yanıtın ilk 200 karakteri `ornek` alanında görünür.
- Tekrar önleme **workflow static data**'da tutulur. Workflow'u silip yeniden
  içe aktarırsan bu hafıza sıfırlanır ve en güncel bülten bir kez daha gönderilir.
- Bülten yoksa (`latest.json` yok / rutin yeni öğe bulamadı) `neverError` sayesinde
  workflow hata vermez, sessizce IF'in false koluna gider.
- Bu JSON n8n sürümüne karşı **doğrulanmadı** — bu oturumdan n8n API'sine
  anahtar olmadan erişilemedi. Düğüm `typeVersion`'ları güncel n8n'e göre yazıldı;
  içe aktarmada bir düğüm uyarı verirse o düğümü açıp kaydetmek genelde yeterli.
