# n8n — AI Bültenini mail olarak gönder

| Dosya | Durum |
|---|---|
| **`ai-bulteni-mail-gonder-v2.json`** | **Güncel (v2.1, 21 Ağustos 2026).** Klasörü GitHub API ile listeler, işaretçi dosyasına ihtiyaç duymaz; **en yeni bültenden** başlar, 36 saatten eski backlog'u postalamaz. |
| `ai-bulteni-mail-gonder.json` | v1 — geride bırakıldı, rollback için tutuluyor. `latest.json`'a bağımlı. |
| `test/dugum-testi.js` | v2'nin Code düğümlerini n8n olmadan çalıştıran test. |

n8n: CT 202, `192.168.1.24:5678`, dışarıdan `https://n8n.ahmetkaraca.com`.

## 21 Ağustos 2026 arızası — "yeni bülten gelmiyor, 11 Ağustos geliyor"

**Belirti:** 21 Ağustos'ta workflow elle çalıştırıldı, mail geldi ama içerik
**11 Ağustos** bültenindi. O günün bülteni gelmedi.

**Kök neden — `Gönderilmeyenleri bul` en ESKİden başlıyordu.** Düğüm dosya
listesini artan sırada tutuyor, `bekleyen` listesini de o sırada bırakıp
`bekleyen.slice(0, TUR_BASINA_LIMIT)` ile **en eski 3'ü** seçiyordu. v2 içe
aktarıldığında static data boş olduğu için tohumlama `ESIK = 2026-08-10-0000.md`
ile yapıldı ve 10 Ağustos'tan 21 Ağustos'a kadar **25 bülten** birden "bekleyen"
oldu. Tur başına 3 mail limitiyle:

| Tur | Giden |
|---|---|
| 1 | 10 Ağustos × 3 |
| 2 | **11 Ağustos × 3** ← kullanıcının gördüğü mail |
| … | … |
| 9 | 21 Ağustos |

Yani hata değildi, **sıra**ydı: günün bülteni kuyrukta 25. olduğu için ~9 tur
(≥9 saat) sonra gelecekti. Bu arada gelen her mail eski haber olacaktı.

**Düzeltme (v2.1) — iki değişiklik:**

1. **En yeniden eskiye sırala.** `bekleyen` artık azalan sırada; günün bülteni
   backlog ne kadar büyük olursa olsun **ilk turda** gider.
2. **Taze pencere (`TAZE_SAAT = 36`).** Bekleyen bir bülten bu yaştan eskiyse
   postalanmaz, mail atılmadan `gonderilenler` kümesine yazılır — arşiv maili
   yağmaz, kuyruk da tıkanmaz. Dosya adındaki damga Europe/Istanbul (UTC+3,
   DST yok) kabul edilerek yaşa çevrilir.
   **İstisna:** en yeni bekleyen bülten yaşına bakılmaksızın her zaman gider —
   rutin günlerce durmuş olsa da son bülten sessizce yutulmaz.

Bu ikisi birlikte asıl kırılganlığı da kapatıyor: artık static data kaybolsa,
workflow yeniden içe aktarılsa ya da `ESIK` yanlış olsa bile en kötü senaryo
"son bülten + son 36 saatinkiler" gider — arşiv replay'i imkânsız.

`TAZE_SAAT`'i 0 yaparsan davranış "yalnızca en yeni bülten"e iner.

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
| Birikmiş bülten | kaçarsa kaybolur | **en yeniden** başlayarak tur başına 3; 36 saatten eskisi postalanmaz (v2.1) |
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
   data boş olduğu için ilk çalışmada bu eşikten **yeni** bültenler bekleyen
   sayılır. Şu an `2026-08-21-0000.md`. v2.1'deki taze pencere sayesinde eşik
   yanlış kalsa da arşivden mail yağmaz (36 saatten eskiler postalanmadan
   işaretlenir), yine de import ettiğin güne çekmek en temizi.
   - v1 o bültenlerden birini zaten postaladıysa dosya adını
     `ZATEN_GONDERILDI` dizisine ekle.
4. **Eski v1 workflow'unu deaktive et.** İkisi birlikte aktif kalırsa aynı
   bülten iki kez gider.
5. **Execute Workflow** ile bir kez elle çalıştır, gelen maili doğrula.
   ⚠️ Elle çalıştırmada n8n **static data'yı kaydetmez** — aşağıdaki nota bak.
6. Workflow'u **Active** yap. Tekrar önleme ancak buradan sonra çalışır.

## Test

```
node "AI Haberleri/n8n/test/dugum-testi.js"
```

Workflow JSON'undaki `jsCode`'ları doğrudan okur (kopya tutmaz), Contents API
yanıtını `Bultenler/` klasöründen üretir, Gmail yanıtlarını taklit eder.
Kapsam: tohumlama, **en yeninin ilk turda seçilmesi**, gerçek bültenlerle
Markdown→HTML + RFC822 üretimi, kısmi gönderim hatası, tekrar deneme, boş tur,
bozuk API yanıtları, işaretçi dosyası olmadan yeni bülten yakalama, tur limiti,
**backlog'un sessizce boşaltılması**, **rutin günlerce durduğunda son bültenin
yine gitmesi**. Düğümleri n8n arayüzünden düzenlersen JSON'u dışa aktarıp bunu
tekrar çalıştır.

`TAZE_SAAT` / `TUR_BASINA_LIMIT` / `ESIK` sabitleri test tarafından `jsCode`'un
içinden okunur; düğümde değiştirirsen test kendini ona göre ayarlar. Zaman
bağımlı senaryolar "şimdi"ye göre üretilen sahte dosya adlarıyla kurulur, bu
yüzden test yıllar sonra da aynı sonucu verir.

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
- Bültenler artık **en yeniden eskiye** postalanır ve `TAZE_SAAT`'ten (36 saat)
  eski bekleyenler mail atılmadan işaretlenir. Sıralamayı tekrar artan yaparsan
  21 Ağustos arızası geri gelir.
- Tekrar önleme **workflow static data**'da (`gonderilenler`, son 200 dosya).
  Workflow'u silip yeniden içe aktarırsan bu hafıza sıfırlanır — `ESIK`
  o yüzden var. Taze pencere de ikinci savunma hattı: hafıza sıfırlansa bile
  arşiv postalanmaz.
- ⚠️ **n8n static data'yı yalnızca üretim (Active/cron) çalışmalarında kaydeder;
  "Execute Workflow" ile elle çalıştırmada kaydetmez.** Yani elle test edersen
  aynı bülten bir sonraki elle çalıştırmada tekrar gider — hata değil, n8n'in
  davranışı. Tekrar önlemenin çalıştığını görmek için workflow'un **Active**
  olması gerekir. (n8n'de static data'nın konteyner yeniden başlatmasından
  sonra kalıcı olmadığı bildirilen bir hata da var: n8n-io/n8n#3662. CT 202
  yeniden başladıysa `gonderilenler` boşalmış olabilir — v2.1'de bu artık
  arşiv maili yağmasına yol açmaz.)
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
