# n8n — AI Bültenini mail olarak gönder

| Dosya | Durum |
|---|---|
| **`ai-bulteni-mail-gonder-v2.json`** | **Güncel.** Klasörü GitHub API ile listeler, işaretçi dosyasına ihtiyaç duymaz. |
| `ai-bulteni-mail-gonder.json` | v1 — geride bırakıldı, rollback için tutuluyor. `latest.json`'a bağımlı. |
| `test/dugum-testi.js` | v2'nin Code düğümlerini n8n olmadan çalıştıran test. |

n8n: CT 202, `192.168.1.24:5678`, dışarıdan `https://n8n.ahmetkaraca.com`.

## v1 neden değişti — 10 Ağustos 2026 arızası

v1'in tek girdisi `Bultenler/latest.json` işaretçi dosyasıydı. Rutinin
zamanlanmış prompt'undan "latest.json'ı yaz" adımı düştü (6 Ağustos 23:08
çalışmasından sonra), dosya `2026-08-06-2308.md` üzerinde takılı kaldı ve
n8n static data'sında o dosya "gönderildi" olarak duruyordu. Sonuç: 10
Ağustos'ta üretilen **iki bülten de postalanmadı** — hata da vermedi, IF
sessizce false koluna gitti.

v2 bu bağımlılığı tümden kaldırır: `Bultenler/` klasörünü listeler ve
**dosya klasörde göründüğü an** mail atar. Rutin `latest.json` yazmasa da,
prompt bir daha kaysa da e-posta akışı kırılmaz.

İkinci bulgu: v1'in `?cb=` cache-buster'ı **çalışmıyordu.**
`raw.githubusercontent.com` yanıtları ~5 dk önbelleklenir ve `cb` parametresi
ile `Cache-Control: no-cache` bunu atlatmıyor (ölçüldü: push'tan 5 dk sonra
tazelendi). Yani rutin :22–:25 arasında push ederse o saatin taraması
bülteni kaçırıyordu. v2 hem listeyi hem dosya içeriğini **GitHub Contents
API** üzerinden okur — o uçta CDN önbelleği yok.

## Ne değişti (v1 → v2)

| | v1 | v2 |
|---|---|---|
| Tetikleyici girdi | `latest.json` (rutin yazmalı) | `Bultenler/` klasör listesi |
| Kaynak uç | `raw.githubusercontent.com` (~5 dk CDN) | `api.github.com/…/contents` (önbelleksiz) |
| Tekrar önleme | tek dosya adı (`sonGonderilen`) | dosya adı **kümesi** (`gonderilenler`) |
| Mail konusu | `latest.json`'daki `baslik` | bültenin kendi **H1** satırı |
| Birikmiş bülten | kaçarsa kaybolur | tur başına 3'e kadar sırayla yollar |
| Mail hatası | execution patlar, hepsi tekrar gider | o dosya işaretlenmez, yalnızca o tekrar denenir |

## Akış

```
Her saat :25'te kontrol et  (Schedule Trigger, 25 * * * *)
  → Bülten listesini çek    (HTTP, GitHub Contents API, text + fullResponse)
  → Gönderilmeyenleri bul   (Code, static data kümesiyle karşılaştır)
  → Gönderilecek var mı?    (IF)
      ├─ true  → Bülteni indir (HTTP, Accept: …github.raw) → Mail gövdesini hazırla
      │          → Mail gönder (Gmail) → Gönderildi olarak işaretle
      └─ false → Gönderilecek bülten yok - bitir (NoOp)
```

`Gönderilecek var mı?` true kolundan sonraki düğümler **item başına** çalışır;
bir turda birden fazla bülten postalanabilir.

## Kurulum

1. n8n → **Workflows** → **Import from File** → `ai-bulteni-mail-gonder-v2.json`.
2. **Mail gönder** düğümünü aç, Gmail kimlik bilgisini elle seç — içe aktarma
   kimlik bilgilerini taşımaz.
3. **`Gönderilmeyenleri bul` düğümündeki `ESIK` sabitini kontrol et.** Static
   data boş olduğu için ilk çalışmada bu eşikten **yeni** tüm bültenler
   postalanır. Şu an `2026-08-10-0000.md` — yani 10 Ağustos'ta kaçan iki
   bülten gider. Başka bir zamanda import ediyorsan eşiği o güne çek, yoksa
   arşivden mail yağar.
   - v1 o bültenlerden birini zaten postaladıysa dosya adını
     `ZATEN_GONDERILDI` dizisine ekle.
4. **Eski v1 workflow'unu deaktive et.** İkisi birlikte aktif kalırsa aynı
   bülten iki kez gider.
5. **Execute Workflow** ile bir kez elle çalıştır, gelen maili doğrula.
6. Workflow'u **Active** yap.

## Test

```
node "AI Haberleri/n8n/test/dugum-testi.js"
```

Workflow JSON'undaki `jsCode`'ları doğrudan okur (kopya tutmaz), Contents API
yanıtını `Bultenler/` klasöründen üretir, Gmail yanıtlarını taklit eder.
Kapsam: tohumlama, gerçek bültenlerle Markdown→HTML + RFC822 üretimi, kısmi
gönderim hatası, tekrar deneme, boş tur, bozuk API yanıtları, işaretçi dosyası
olmadan yeni bülten yakalama, tur limiti. Düğümleri n8n arayüzünden
düzenlersen JSON'u dışa aktarıp bunu tekrar çalıştır.

## Notlar

- **Repo public**, bu yüzden GitHub kimlik bilgisi/token yok. Anonim GitHub API
  limiti **60 istek/saat/IP**; saatlik tarama en fazla 4 istek harcar (1 liste +
  3 dosya). Repo private'a çevrilirse iki HTTP düğümüne token eklemek gerekir —
  ve `download_url` yerine `url` + `Accept: application/vnd.github.raw`
  kullanıldığı için token ile de çalışmaya devam eder.
- **`latest.json` artık kullanılmıyor.** Rutin yazmaya devam edebilir (zararsız)
  ya da prompt'tan çıkarılabilir; v2 dosyaya hiç bakmıyor.
- Bültenler `YYYY-AA-GG-SSDD.md` biçiminde olduğu için **dosya adı sıralaması
  kronolojik sıralamadır**; kod bunu kullanıyor. Adlandırma değişirse
  `Gönderilmeyenleri bul` düğümündeki regex ve sıralama da değişmeli.
- Tekrar önleme **workflow static data**'da (`gonderilenler`, son 200 dosya).
  Workflow'u silip yeniden içe aktarırsan bu hafıza sıfırlanır — `ESIK`
  o yüzden var.
- **Mail gönder** düğümü `onError: continueRegularOutput` ile çalışır: bir mail
  patlasa da diğerleri gider, patlayan dosya işaretlenmez ve sonraki saatte
  tekrar denenir. Hata metni `Gönderildi olarak işaretle` çıktısındaki
  `basarisiz` alanında görünür.
- `Bülten listesini çek` düğümü `responseFormat: text` + `fullResponse: true`
  ile çalışır ve JSON sonraki Code düğümünde elle ayrıştırılır. Bu, HTTP
  durumunu (403 / rate limit) bozuk gövdeden ayırt etmek için gerekli — yanıt
  biçimini değiştirirken bunu bozma.
- Bu JSON canlı bir n8n sürümüne karşı **doğrulanmadı**; bu oturumdan n8n
  API'sine anahtar olmadan erişilemedi (`/api/v1/*` → 401). Code düğümlerinin
  mantığı yukarıdaki testle doğrulandı. İçe aktarmada bir düğüm uyarı verirse
  o düğümü açıp kaydetmek genelde yeterli.
