# Homelab iş listesi — sekiz repo (2026-11-01)

Kapsam: `main` uçları — brain `6dbccaa` · finance 0.58.2 `9017308` · library 1.19.12 `ddc5646` · health 0.37.3 `2279b1d` · memory 0.17.5 `6ffd5c6` · sys 0.125.0 `0291bbc` · ha 1.76.0 `654d843` · sage 0.91.0 `4686e8d`.

## Nasıl okunur

- Her madde: **kanıt** (`dosya:satır`), **neden**, **adımlar**, **bitti ölçütü**. Ölçüt sayılabilir ya da tek komutla doğrulanabilir.
- Öncelik: **P1** risk/doğruluk/güvenlik · **P2** kalite/operasyon · **P3** belge hijyeni. Büyüklük: **S** < yarım gün · **M** 1–2 gün · **L** daha fazla (tahmin).
- Madde kodları: B brain · F finance · L library · H health · M memory · S sys · HA ha · SG sage · X ve Y ortak maddeler (X ilk dört repodan, Y ajan repolarından doğdu; çakışmalar Ortak bölümünde işaretli).
- Yöntem: proje tanımları, ADR'ler, CHANGELOG'lar, CI/deploy dosyaları, brain proje notları ve Fable 2026-10 takip tahtası okundu; sekiz repoda paralel kod denetimi yapıldı; her kritik bulgu kaynak dosyada yeniden doğrulandı. Canlı CT durumu (`.env`, nftables, venv, cron, coverage yüzdesi) repodan ölçülemedi ve "doğrulanamadı" diye işaretlendi.
- Bilinçli kapsam dışı: finance Faz 3 (2026-09-04'te kapatıldı); kabul edilmiş artık riskler (2FA, at-rest şifreleme, Telegram bildirimi, `sage_ro` defacl, sys GET uçlarının açık olması, ha `POST /predict/heating` kimliksiz, memory two_factor yok, sage kabul kırmızısında geri alma yok, kota eşiği "tek ses").

## Özet tablo

| Repo | P1 | P2 | P3 | En acil üç |
|---|---|---|---|---|
| brain | 4 | 7 | 2 | B-01 ingest venv/rc · B-02 sır kapısı · B-03 health probu |
| finance | 6 | 8 | 4 | F-01 audit'siz yazma · F-02 `/api/health` sızıntısı · F-04 taksit dedup |
| library | 5 | 9 | 2 | L-01 health ucu yok · L-02 storage yedeği · L-03 `password_hash`/argon2 |
| health | 7 | 10 | 2 | H-01 zip bellek/bomba · H-02 PDF sihirli bayt · H-03 CI'da build yok |
| memory | 3 | 4 | 1 | M-01 kaynak izleme · M-02 örnekleyici hatası · M-03 onay sınırları |
| sys | 4 | 7 | 1 | S-01 `/token/upload` · S-02 pin/lock · S-03 DB saklama |
| ha | 4 | 7 | 1 | HA-01 OOM drop-in · HA-02 deploy kapısı · HA-03 LLAT bayrağı |
| sage | 3 | 7 | 1 | SG-01 brain-mcp alarmı · SG-02 panel kapısı · SG-03 `audit` saklama |
| ortak | — | 13 | — | Y-01 parite testi · X-01/X-02 e2e ve CHANGELOG kapısı · Y-05 alarm bayrakları |

Toplam: 109 repo maddesi + 13 ortak madde. Ortak ölçümler: sys ↔ ha ↔ sage arasında "birebir aynı" ilan edilen beş dosya (`whatsapp-sidecar/index.js`, `s6_gate.py`, `event_log.py`, `brain_context.py`, `kota.py`) 0 satır fark; `notify_format.approval_card()` gövdesi eşit; finance ↔ health `Label`/`Modal` eşit. Test envanteri: brain 147 pytest · finance 381+46 vitest · library 180 unit + 40 e2e · health 321 unit · memory ~138 node test · sys 348 unittest · ha test paketi yok (41/70 modülde `_self_check`) · sage 1 902 pytest.

---

## homelab-brain

### B-01 · `brain_ingest_file` yanlış venv ile koşuyor, hata kodunu yutuyor — P1 · S
- Kanıt: `_sistem/brain-mcp/brain_mcp/tools/ingest_tools.py:63` `cmd = [sys.executable, "-m", "ingest", …]` (brain-mcp venv'i); `:72-73` `rc != 0` hata olarak dönmüyor. `_sistem/deploy/setup.sh:22-36` `[local]` dönüştürücü ekstraları yalnız ingest venv'inde.
- Neden: MCP'den tetiklenen ingest PDF/docx dönüştürücüsüz ve `ingest/.env`'siz (vision anahtarı yok) sessizce zayıf çalışabilir; canlıda doğrulanmadı.
- Adımlar:
  1. `BRAIN_INGEST_PYTHON` env'i ekle; `brain-ingest.service`'teki venv python yolunu `brain-mcp.service`'e de ver.
  2. `cmd[0]`'ı bu env'den al; yoksa `sys.executable`'a düş ve uyarı logla.
  3. `proc.returncode != 0` → dönüşü `Ingest başarısız (rc=N): …` ile başlat.
  4. Test: sahte python yolu ile çağrı → rc ≠ 0 mesajı.
- Bitti: CT 210'da MCP ile bir PDF ingest edildiğinde sidecar frontmatter'ında `cikartici: pymupdf4llm` (ya da docling) yazıyor; `test_ingest_tools` yeşil.

### B-02 · Sır kapısı iki pakette farklı; brain-mcp Anthropic anahtarını nota yazdırır — P1 · S
- Kanıt: `_sistem/brain-mcp/brain_mcp/safety.py:23-29` `SECRET_HINTS` = PEM, `ghp_`, `github_pat_`, `xoxb-`; `sk-ant-` ve `password|parola` yok. `_sistem/ingest/ingest/router.py:40` `sk-ant-…` deseni var.
- Adımlar:
  1. Deseni `_sistem/shared/brain_shared/` altına tek liste olarak taşı (PEM, `ghp_`, `github_pat_`, `xoxb-`, `sk-ant-[A-Za-z0-9_-]{20,}`, `(password|parola|şifre|bearer)\s*[:=]`).
  2. `safety.py` ve `router.py` bu listeyi import etsin.
  3. `test_write_guards.py`'ye `sk-ant-` ve `parola: x` reddi (2 test).
- Bitti: `grep -rn SECRET_HINTS _sistem | wc -l` = 1 tanım; 2 yeni test yeşil.

### B-03 · brain-health probu yalnız systemd durumuna bakıyor; vision timer'ı listede yok — P1 · M
- Kanıt: `_sistem/health/brain_health.py:36-47` `DEFAULT_UNITS` 7 birim; `_sistem/deploy/systemd/brain-vision-batch.timer` listede değil. gitsync tazeliği, `_gelen/` birikimi, wiki bayatlığı, brain-mcp HTTP probu yok.
- Adımlar:
  1. `brain-vision-batch.timer`'ı `DEFAULT_UNITS`'e ekle.
  2. `/health` JSON'a `gitsync_age_s` (son başarılı pull damgası dosyasından), `gelen_backlog` (dosya sayısı), `wiki_stale` (`public/index.html` mtime < en yeni `.md` mtime), `mcp_http_ok` (`127.0.0.1:8765` GET) alanları.
  3. Eşikler: gitsync > 3600 s, backlog > 0 ve en eski dosya > 1 saat, wiki_stale = true → `status: degraded`.
  4. `test_health.py` +4 senaryo; CT 207 `layer0` probuna yeni alanları bağla.
- Bitti: `curl :8767/health | jq` dört yeni alanı gösteriyor; `test_health` 18 test yeşil.

### B-04 · systemd birimleri root ve sertleştirmesiz — P1 · M
- Kanıt: `_sistem/deploy/systemd/*` 12 dosya; hiçbirinde `User=`, `ProtectSystem=`, `NoNewPrivileges=`, `PrivateTmp=` yok (`grep -l` boş). `ct210-kurulum.md:53` "systemd servisleri root çalışır".
- Adımlar:
  1. CT 210'da `brain` sistem kullanıcısı; `/opt/homelab-brain`, `/var/lib/brain-graf`, `/var/cache/fastembed` sahipliği.
  2. Her `.service`'e `User=brain`, `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectSystem=strict`, `ReadWritePaths=` (yukarıdaki üç yol).
  3. gitsync'in git kimliğini (`/root/.git-credentials` → deploy key, bkz. B-13) brain kullanıcısına taşı.
  4. Tek tek restart + `systemd-analyze security <birim>`.
- Bitti: 12 birimde `User=brain`; `systemd-analyze security` her birimde "MEDIUM" ya da altı; `brain-mcp`, `ingest`, `gitsync`, `wiki-rebuild` bir tur başarıyla koştu.

### B-05 · Ingest: boyut tavanı, deneme sayacı, dead-letter ve açılış taraması yok — P2 · M
- Kanıt: `_sistem/ingest/ingest/pipeline.py:212-217` başarısız dosya `_gelen/`'de kalır, manifest'e yazılmaz; `watch.py:36-39` istisna yalnız `print`; `watch.py:17-19,55-58` servis açılışında mevcut dosyalar taranmıyor; `st_size` kontrolü yok.
- Adımlar:
  1. `BRAIN_INGEST_MAX_MB` (varsayılan 200); aşan dosya `_gelen/.failed/` + manifest satırı `neden: boyut`.
  2. Dosya başına deneme sayacı (3); üçüncüde `.failed/`'e taşı.
  3. Servis başlarken `_gelen/` tarama (`--inbox` davranışı).
  4. `gelen_backlog` ve `failed_count` B-03'teki `/health`'e.
- Bitti: 1 GB sahte dosya testi `boyut` ile reddediliyor; restart sonrası bekleyen dosya 60 s içinde işleniyor; `test_pipeline` +3.

### B-06 · CI tek kapı: lint, bağımlılık denetimi, kilit dosyası ve vault hijyeni yok — P2 · M
- Kanıt: `.github/workflows/tests.yml:21-41` tek job (`rg --version` + `pip install` + `pytest`); `paths: ["_sistem/**"]` → not commit'leri CI'ya girmiyor. `pyproject.toml`'larda `fastmcp`/`mcp` sabit, geri kalanı `>=`; lock dosyası yok; dependabot yok.
- Adımlar:
  1. `uv lock` → `uv.lock` commit; CI kurulumunu lock'tan yap.
  2. `ruff check _sistem` job'ı (yapılandırma `pyproject.toml`).
  3. `pip-audit` job'ı (yalnız üretim bağımlılıkları kapı, dev bilgi).
  4. Haftalık `schedule` job'ı: `python -m brain_mcp.lint` (ya da `maintain_tools._lint`) → `kopuk_wikilink`, `surum_drift`, `gecersiz_durum` boş değilse kırmızı.
  5. `paths` filtresine `**/*.md` için yalnız 4. job'ı bağla.
- Bitti: `tests.yml`'de 4 job; `uv.lock` repoda; haftalık koşu bir kez yeşil.

### B-07 · Test boşlukları: 5 paket ve 7 MCP aracı testsiz — P2 · M
- Kanıt: 147 `def test_` / 13 dosya (grep sayımı). Testsiz: `_sistem/semantic/reindex.py`, `deploy/gitsync.sh`, `wiki/` (build/deploy + 3 JS plugin), `hooks/`, `graphify/`; araçlardan `brain_get_index`, `brain_get_moc`, `brain_list`, `brain_pull`, `brain_find_duplicates`, `brain_suggest_link_fix`, `brain_stats` hiçbir testte geçmiyor.
- Adımlar:
  1. 7 araç için geçici vault fixture'ıyla birer smoke test (`test_read_tools.py`, `test_maintain_tools.py`).
  2. `reindex.py`: embed metni üretimi + artımlı hash atlaması (2 test, embed stub'lı).
  3. `gitsync.sh`: `bats` ya da `sh -n` + sahte remote ile 1 test.
- Bitti: `grep -l "brain_stats\|brain_pull\|…" _sistem/tests/*.py` 7/7; `_sistem/<paket>` başına ≥1 test dosyası.

### B-08 · `brain_gorev_bulgu` aracı (Claude özel alanı ADR Faz 1) hiç yazılmadı — P2 · S
- Kanıt: `kararlar/2026-09-04-claude-ozel-alan-tasarimi.md:172,176` ve `_claude/README.md:58` "Faz 1'de gelecek dar `brain_gorev_bulgu` tool'u"; `_sistem/brain-mcp/brain_mcp/tools/*.py` içinde yok (brain-mcp 0.19.1).
- Adımlar:
  1. `write_tools.py`'ye `brain_gorev_bulgu(tahta, rutin, madde)` — oluştur-ya-da-ekle, yalnız `_claude/gorevler/**/bulgular-<rutin>.md`.
  2. Test: var olmayan dosya oluşur, var olana append edilir, başka yola yazamaz (3 test).
  3. `brain-mcp/README.tr.md` araç tablosu + `_claude/README.md:58` güncelle.
- Bitti: README tablosunda araç var; `_claude/README.md`'de "gelecek" ifadesi yok.

### B-09 · Semantik katman: belgeler "ertelendi" diyor, canlıda reindex timer'ı açık; ayar iki `.env`'de çift — P2 · S
- Kanıt: `README.md:48` ve `_sistem/semantic/README.tr.md:7` "ertelenmiş"; `_sistem/CHANGELOG.md:297-303` 2026-10-05'te MiniLM ile `reindex.py --full` (199 not) ve timer aktif; `config.py:52` varsayılan kapalı; `brain-reindex.service:7` `EnvironmentFile=…/ingest/.env` → model/DSN hem `brain-mcp/.env` hem `ingest/.env`'de. Hafıza iyileştirme tahtası adım 5 ölçütü 2026-11-02'de kontrol edilecek (`_claude/gorevler/2026-10-05-claude-hafiza-iyilestirme/gorev.md`).
- Adımlar:
  1. CT 210'da `BRAIN_SEMANTIC_ENABLED` ve `BRAIN_EMBED_MODEL` değerlerini iki `.env`'den oku; farklıysa eşitle.
  2. Model/DSN'i `_sistem/shared/.env`'e indir, iki servis onu `EnvironmentFile` ile alsın.
  3. `README.md:48` ve semantic README'yi gerçek duruma göre yaz.
  4. 2026-11-02: `_sistem/tests/arama_eval.py` koş; parafraz ıskası ≥5 ise tahtada adım 5'i aç, değilse tahtayı `kapandi` yap ve arşivle.
- Bitti: `grep BRAIN_EMBED_MODEL _sistem/*/.env` tek satır; iki README "kapalı/ertelendi" demiyor; hafıza tahtası arşivde ya da adım 5 açık.

### B-10 · `_sistem/finans-db` ve `_sistem/saglik-db` emekli DB'leri anlatıyor; README ağacı eksik — P2 · S
- Kanıt: `_sistem/saglik-db/README.md:3-4` "`saglik` veritabanında tutulur" (DB 2026-07-18'de DROP — `kararlar/2026-07-18-saglik-brain-ayrismasi.md:41`); `_sistem/finans-db/README.md:3` "`finans` veritabanında" (donmuş döküm — `projeler/homelab-finance.md:145`). `_sistem/README.tr.md:6-18` ağacında `finans-db`, `saglik-db`, `graphify`, `githooks`, `marka` yok.
- Adımlar:
  1. `git mv _sistem/finans-db _sistem/arsiv/finans-db` ve aynı şekilde `saglik-db`; her README'nin başına "EMEKLİ (tarih, neden, yeni kaynak)" bloğu.
  2. `_sistem/README.tr.md` ağacını `ls _sistem` ile eşitle.
- Bitti: `ls _sistem` ile README ağacı birebir; `grep -rn "saglik DB" _sistem --include=README*` yalnız arşivde.

### B-11 · Konsolidasyon tetikleyicisi belirsiz, üç farklı not sayımı var — P2 · S
- Kanıt: `kararlar/2026-06-29-konsolidasyon-ertelendi.md:38` "~200 not VEYA `log.md` ~500+ satır"; ölçüm: 153 not (`_claude` hariç) / 242 (dahil) / reindex 199; `log.md` 314 satır ama 108.844 bayt / 210 kayıt; sonunda 71 boş satır.
- Adımlar:
  1. ADR'ye tek ölçüt: "vault notu (`_claude`, `_sistem`, şablon hariç) ≥ 200 **ya da** `log.md` ≥ 150 KB".
  2. `brain_stats` çıktısına `not_sayisi`, `log_bayt`, `log_kayit`.
  3. `brain_lint`'e eşik aşımı uyarısı.
  4. `log.md` sondaki boş satırları temizle (`sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}'`).
- Bitti: ADR'de tek ölçüt; `brain_stats` üç alanı döndürüyor; `tail -c 200 log.md` boş satırla bitmiyor.

### B-12 · Vault hijyeni (tek tur, maddeler ayrı ayrı ölçülür) — P3 · M
- Kanıt ve bitti ölçütleri:
  1. **8 haftalık rutin tahtası arşivlenebilir** (`_claude/README.md:49-52` kuralı; 09-05, 09-07, 09-14, 09-21, 09-28, 10-05, 10-12, 10-19'da `durum: bekliyor` 0) → `git mv _claude/arsiv/`; bitti: `ls _claude/gorevler | grep haftalik` = 2 (10-02, 10-26).
  2. **6 panel maddesi `durum: bekliyor`** (10-26 sunucu-tarama sdb SMART, repo-belge-tazeleme -03/-04; 10-02'de 3) → panelden kabul/ret; bitti: `grep -r "^durum: bekliyor" _claude/gorevler | wc -l` = 0.
  3. **Bayat tahtalar:** `2026-09-04-homelab-kalan-isler/gorev.md` (güncellendi 09-22; madde 1 "Bilgi notu iste" muhtemelen bayat — health CHANGELOG 0.26.3 kuyruğun canlıda çalıştığını gösteriyor), `2026-10-08-fable-tarama/README.md:21` `durum: bekliyor` (iş 10-17'de bitti), `2026-09-09-federasyon-faz2-kod.md` (09-09) → her birine kapanış tarihi + arşiv; bitti: `_INDEX.md` "Açık görev tahtaları" ≤ 3 satır.
  4. **`projeler/homelab-health.md` "Açık işler" bölümü süpersede edilmemiş:** `:57` "saglik emekliye ayırma — henüz dokunulmadı" (aynı notun `:79`'u emekli dedi), `:58` "ekler PDF geri-import" (health 0.3.1'de bitti), `:81` "watch sürekliliği" (health 0.26.0/ADR 0011 ile Drive → n8n kuruldu); aynı şekilde `kararlar/2026-07-16-apple-watch-saglik-postgres.md:48` ve `kisisel/saglik/_MOC.md` "oto-push henüz kurulmadı" → `~~…~~ (geçersiz: tarih)`; bitti: notta "henüz" geçen satır 0.
  5. **`altyapi/2026-10-04-sage-db-parola-sizintisi.md`:** `:45` "Kapandı: parolalar döndürüldü" ama üst başlık "Durum — açık" ve `altyapi/_MOC.md:31` "(açık)" → başlık ve MOC düzelt; bitti: MOC satırında "(kapandı 2026-10-08)".
  6. **Şema dışı değer:** `altyapi/2026-09-03-graphify-pr-araclari-stdin-kilitlenmesi.md` ve `altyapi/2026-09-03-ct209-postgres-oom-ajan-korlugu.md` `katman: altyapi` (enum `cekirdek|destek|cevresel`) → `destek`; bitti: `grep -rl "^katman: altyapi"` boş.
  7. **Taslak yığını:** 56 not `yasam_dongusu: taslak` (kararlar 23/51, altyapi 15/15); 9/28 `katman: cekirdek` not `guncellendi < 2026-08-01` (`kisisel/_MOC`, `tercihler/_MOC`, `kisiler/_MOC`, `kisisel/saglik/_MOC`, kök `CLAUDE.md` 06-27, 4 ADR) → ADR'leri `kararli`/`arsiv` yap, MOC tarihlerini tazele; bitti: `brain_lint().bayat_cekirdek_notlar` boş, taslak ADR ≤ 5.
  8. **`index.md` router'ı eksik:** 13 proje notu (`app-letsplay`, `homelab-aa-mcp`, `-agent-eval`, `-agent-framework`, `-auth`, `-bench`, `-finance`, `-health`, `-immich-mexma`, `-llm`, `-model-ha`, `-portal`, `-ui`), 32 karar (liste 2026-07-28'de donmuş), 14 altyapı notu index'te yok → index'i "son 10 + MOC'a bak" kuralına bağla ve bunu `index.md` başına yaz; bitti: her alan için "index N / MOC M" satırı var ve `brain_lint` kopuk link 0.
  9. **`log.md` içinde 4 kopuk wikilink** (`[[projeler/homelab-brain]]`, `[[projeler/homelab-sage-agent]]`, `[[projeler/homelab-agent]]`, `[[2026-07-02 …]]`) → yeni ada çevir; bitti: lint 0.
  10. **`surumler.md`** 2026-10-16 ve 2026-10-17 CHANGELOG başlıklarını içermiyor → ekle; bitti: `maintain_tools._surum_drift` boş.
  11. **`projeler/_MOC.md:106`** "brain-mcp 17 araç" (kodda 20 `@mcp.tool`) → 20; reconcile rutini `_sistem/`'i de saysın.
  12. **`kaynaklar/github-repolari/`** yalnız `.gitkeep`, `index.md:87` ve `README.md:53` "ingest edilir" diyor → ya doldur ya satırları kaldır; bitti: iddia ile dizin tutarlı.
  13. **`kararlar/2026-09-30-hafiza-paneli.md:42`** "açık kalan tek konu arama" ↔ `:247` kararlaştı → süpersede.
  14. **`kisisel/finans/kart-harcama-kategorileri.md:36-38`** ~2.500 kategorisiz satır, son tarih 2026-12-31 → finance F-19 ile birlikte.

### B-13 · `ct210-kurulum.md` PAT'i düz metin credential store ile anlatıyor — P3 · S
- Kanıt: `_sistem/deploy/ct210-kurulum.md:57-58` `/root/.git-credentials` + `credential.helper store`; `:49` deploy key "önerilen".
- Adımlar: PAT adımını kaldır, yalnız salt-okunur deploy key (finance/health deseni) anlat; CT 210'da `.git-credentials` varsa sil, PAT'i iptal et.
- Bitti: dokümanda tek yöntem; CT 210'da `/root/.git-credentials` yok.

Not (doğrulanamadı, iş değil): `CLAUDE.md:42` brain-mcp "127.0.0.1:8765" derken `brain-mcp/.env.example:19` `BRAIN_MCP_HOST=0.0.0.0` ve `config.py:49` `BRAIN_ALLOW_WRITE` varsayılan açık. NPM ayrı host olduğu için LAN bind gerekli; Fable tahtasına göre 16 Ekim'de CT 210'a nft izin listesi kuruldu ama repo bunu belgelemiyor. B-04 ile birlikte `ct210-kurulum.md`'ye gerçek bind + nft kuralını yaz; bitti: `ss -ltnp` çıktısı ve nft kuralı dokümanda.

---

## homelab-finance

### F-01 · `upsertPaymentTracking` audit yazmıyor — P1 · S
- Kanıt: `src/lib/actions/finance/payments.ts:228-254` içinde `audit(` yok; örneklenen diğer 10 mutasyon dosyası yazıyor. Tehdit modeli TM-005 "kritik işlemler audit".
- Adımlar: `audit(userId, "upsert", "payment_tracking", {period, itemId, paid})` ekle; `tests/unit/audit.test.ts`'e senaryo; CHANGELOG patch.
- Bitti: `/odeme`'de "ödendi" işaretledikten sonra `/audit` ekranında `payment_tracking` satırı görünüyor; test yeşil.

### F-02 · `/api/health` internete Postgres sürümünü döndürüyor — P1 · S
- Kanıt: `src/app/api/health/route.ts:18-24` `SHOW server_version` → `pg_version`; `src/proxy.ts:12` kimliksiz; README:253 internete açık. Health reposu aynı alanı 0.19.1'de kaldırdı.
- Adımlar: `SELECT 1` ile DB ping'i koru, `pg_version` alanını sil; `THREAT_MODEL` info-disclosure satırına işle; CT 200 sürüm drift denetimi için CI `postgres:17.10` pin'i yeterli.
- Bitti: `curl -s https://finance.ahmetkaraca.com/api/health` → `{"status":"ok","db":"up"}`.

### F-03 · PDF ayrıştırmada zaman/izolasyon sınırı yok — P1 · M
- Kanıt: `docs/THREAT_MODEL.finans.md:81` "zaman sınırı YOK", `:102` artık risk (2). Ayrıştırma süreç içi (tek Node süreci, systemd).
- Adımlar:
  1. `readPdfFile`'ı `worker_threads` içine al; 20 s `AbortSignal` → `PDF_ERROR`.
  2. Birim test: 50 MB rastgele bayt + `%PDF-` başlığı → 20 s içinde hata, süreç ayakta.
  3. THREAT_MODEL (2) satırını güncelle.
- Bitti: test yeşil; `/import`'a bozuk 50 MB dosya yüklenince servis restart'sız 422 dönüyor.

### F-04 · Taksit planı dedup'u tam eşitlik → mükerrer plan; Ziraat tutar/puan karışması; `installment_id` kalıcı çözümü — P1 · M
- Kanıt: `src/lib/finance/pdf/parse.ts:233-236` "kisayol: … İKİNCİ bir plan açılır"; `:319-321` "kisayol: … [tutar, puan] sanar"; `src/lib/actions/finance/spending.ts:19-20` "593 planın 585'i … upgrade = `transactions.installment_id`". `LESSONS.md:30` aynı sınıf hata (2.200 → 2,20) daha önce yaşandı.
- Adımlar (sıra önemli):
  1. `import-core.ts` dedup'una tolerans: `|total_amount − x| ≤ installment_count × 0,05`; 2 birim test.
  2. `buildStatementPreview`: `Σ gider − Σ iade/ödeme` ile `totalDebt` farkı > %1 → önizlemede uyarı + API yanıtında `reconciled:false`; birim test.
  3. Migration (expand): `transactions.installment_id uuid NULL`; import yazsın; `/harcama` sezgisel yol yalnız `NULL` satırlar için.
  4. Prod ölçümü: aynı kart+açıklama+ay için plan sayısı > 1 olan grup sayısı.
- Bitti: ölçüm 0; yeni import'ta bağlı satır oranı %100; önizlemede sağlama satırı görünüyor.

### F-05 · Geri alınamaz action'lar testsiz (52/75) — P1 · M
- Kanıt: `cards.ts` (410 satır, `mergeCards` dahil 8/9 testsiz), `debts.ts` 3/3, `settings.ts` 5/5, `categories.ts` 3/3, `import-pdf.ts` 3/3; `vitest.config.ts:17` coverage include'u action katmanını dışlıyor.
- Adımlar:
  1. `tests/integration/cards.test.ts`: `mergeCards` sayım taşıma, çakışan dönem bloklama, farklı para birimi reddi; `setCardPassive` geri alma (≥5 test).
  2. `delete.ts` cascade: kart + 3 bağlı tür tek transaction, IN_USE reddi (2 test).
  3. CLAUDE.md'ye kural: "geri alınamaz action = entegrasyon testi zorunlu".
- Bitti: CI `rls-isolation` adımında yeni 7 test yeşil; CLAUDE.md satırı var.

### F-06 · e2e/a11y yok; proje belgesi "e2e ile bitti" diyor — P1 · L
- Kanıt: `package.json`'da playwright yok; `.github/workflows/ci.yml:10-13, 282-286` "BEKLİYOR"; `project/finans.project.md:74` "hepsi kod+test+e2e ile bitti"; CHANGELOG'da 5 sürüm "tarayıcıda gözlemlenmedi" (:331, :725, :774, :787, :802). Yerel login Authelia redirect URI yüzünden mümkün değil (`:802`).
- Adımlar:
  1. Test kimliği: `NODE_ENV=test` + `AUTH_TEST_BYPASS=1` ile sahte oturum (yalnız CI/yerel; prod build'de dal yok) **ya da** Authelia'da `finance-staging` client + CI sırrı.
  2. Playwright + axe: `/login`, `/dashboard`, `/import`, `/odeme` (4 spec, 1'i `@axe`).
  3. `ci.yml`'e `e2e` job'ı (library `ci.yml:91-131` deseni).
  4. `finans.project.md:74` ifadesini düzelt.
- Bitti: CI'da `e2e` yeşil; CHANGELOG'daki bir sonraki UI sürümünde "tarayıcıda gözlemlenmedi" yok.

### F-07 · Smoke yalnız DB ping; smoke düşerse otomatik rollback yok — P2 · S
- Kanıt: `.github/workflows/deploy.yml:68-77` smoke = `/api/health`; `docs/adr/0007:62-63` "smoke düşerse otomatik rollback yoktur".
- Adımlar: smoke'a `/login` 200 ve `/dashboard` 302 ekle; smoke FAIL → `deploy/rollback.sh production` (expand/contract altında kod rollback'i güvenli); bir kez bilerek kırık smoke ile prova.
- Bitti: prova koşusunda `current-production` önceki release'e döndü ve `/api/health` 200.

### F-08 · Ekstre otomasyonu için health ucu yok; n8n sessiz durursa alarm yok — P2 · S
- Kanıt: `src/app/api/v1/import/statement/route.ts` durum dosyası yazmıyor; `/api/health*` yalnız DB + iki timer; `CLAUDE.md:84-86` "n8n tarafı sessizce çalışmıyor gibi görünür".
- Adımlar: route her çağrıda `shared/import-api.json` (`last_ok`, `last_error`, `count_30d`) yazsın (`job-status.ts` ortak); `/api/health/import` son başarı > 45 gün ya da son çağrı hata ise 503; sys `layer0.finance_import` probu.
- Bitti: uç var; CT 207 layer0 listesinde yeni prob; 45 gün sahte tarihle 503 testi.

### F-09 · `/odeme` bayat "ödenen" sıfırlanamıyor; `/cards` eski "son ekstre" kuralında — P2 · S
- Kanıt: `CHANGELOG.md:784` "silme arayüzü yok … sonradan gelince geri uygulanır"; `payments.ts` yalnız `get`/`upsert`; `src/app/cards/page.tsx:73` "(güncel değil)"; `:787` "ayrı görev olarak işaretlendi", kapanış yok.
- Adımlar: `resetPaymentTracking(period,itemId)` + satırda "sıfırla" + audit; `/cards` kart borcunu `/odeme` vade kuralına hizala **ya da** README'de "bilinçli fark" yaz.
- Bitti: sıfırla düğmesi var ve audit satırı düşüyor; README'de iki sayfanın kuralı tek paragrafta.

### F-10 · ADR-0008 ±3 gün sabit, ADR-0009 transfer gerçekleşme ayı — P2 · S
- Kanıt: `src/lib/finance/mirror.ts:23` "kisayol: sabit ±3 gün"; `src/lib/actions/finance/payments.ts:132` "kisayol: transfer GERÇEKLEŞTİĞİ ayın satırına"; README:147 kullanıcıya elle giriş zorunluluğu olarak yansıyor.
- Adımlar: prod'da eşleşmeyen elle satırların ekstreye gün farkı dağılımını ölç (tek sorgu); ≥%5'i 3–7 gün aralığındaysa pencereyi `settings`'e taşı, değilse ADR'de "sabit kalır" diye kapat; transfer `occurred_on ∈ [statement_date, due_date]` olan ekstreye bağlansın + `transfer.test.ts` senaryo.
- Bitti: iki ADR'de tarihli karar; `kisayol:` yorumları kalktı ya da "kalıcı" diye işaretlendi.

### F-11 · Hata sınırı yok — P2 · S
- Kanıt: `src/app/` altında `error.tsx`, `global-error.tsx`, `not-found.tsx` yok.
- Adımlar: üçünü ekle (Türkçe, PII'siz, `digest` journald'ye).
- Bitti: `/olmayan-sayfa` 404 sayfası; sahte `throw` ile 500 sayfası ve journald'de `digest`.

### F-12 · `overrides` ADR-0004'e göre gözden geçirilmedi — P2 · S
- Kanıt: `package.json:52-56` postcss/sharp/nanoid; lock'ta `next@16.4.3` `sharp ^0.35.5` istiyor (override `^0.35.3` artık gereksiz); `docs/adr/0004:55-57` "her `next` yükseltmesinde gözden geçirilir"; 0.58.2 notunda override yok.
- Adımlar: `sharp` override'ını sil; `nanoid`/`postcss` için `npm why` ile gerekçe; `npm audit --omit=dev` 0; CHANGELOG + ADR tablosu.
- Bitti: `overrides` yalnız gerekçesi ADR'de yazanlar; audit 0.

### F-13 · Yapısal log yok — P2 · S
- Kanıt: `console.error` 5 dosyada; pino/sentry/metrik yok.
- Adımlar: `logDbError` → tek satır JSON `{ts,where,code,constraint,reqId}`; sys layer0'da `[db]` satır sayısı/saat eşiği.
- Bitti: `journalctl -u homelab-finance -o cat | jq .` geçerli; eşik kuralı CT 207'de.

### F-14 · Yazılı restore prosedürü ve runbook yok — P2 · S
- Kanıt: `deploy/deploy.sh:25` "runbook"a işaret ediyor, dosya yok; `docs/` altında RUNBOOK/RESTORE yok; `project/finans.project.md:177` PITR ve prosedür yokluğu kabul edilmiş risk (prosedür sayfası ucuz, mekanizma değil).
- Adımlar: `docs/RUNBOOK.md`: PBS'ten CT 200 ve CT 211 restore, `shared/.env` kurtarma, Authelia break-glass (README:237-238), `rollback.sh`; bir kez CT 211 klonunda prova, tarih.
- Bitti: dosya var; prova tarihi ve süresi yazılı.

### F-15 · Kart numarası/CVV sınıflandırması "PENDING" — P3 · S
- Kanıt: `docs/DATA_CLASSIFICATION.yaml:91` `encrypted_at_rest: false … gate PENDING`; ADR-0006 riski kabul etmiş.
- Adımlar: YAML'de `gate: accepted (ADR-0006, 2026-09-29)`; ya da `pgcrypto` ile kolon şifreleme (M).
- Bitti: YAML'de PENDING yok.

### F-16 · Küçük `kisayol:`'lar — P3 · S
- Kanıt: `audit-log.ts:31` OFFSET sayfalama; `budgets.ts:41` zincir sınırsız; `import-core.ts:42-43` taksit satırı başına advisory-lock round-trip.
- Adımlar: audit keyset sayfalama; bütçe zinciri 36 ay tavanı; kilit `commitStatementCore`'da bir kez.
- Bitti: 3 yorum kalktı; ilgili testler yeşil.

### F-17 · Belge sapmaları — P3 · S
- Kanıt / bitti:
  1. README:94-95 "Sayfalar" 14 rota, kodda 23 `page.tsx` (`/audit /danisman /faizler /hedefler /kurlar /login /profil /settings /surum` eksik) → tek liste 23.
  2. `project/finans.project.md:7` "ASM pending" ↔ `:262` "tümü kapandı"; `:51` Faz 3 "planlandı" ↔ `:166` "KAPANDI"; `:251` "ücretsiz FX API" ↔ 0.55.0 TCMB; `:89` "parola değişimi" ↔ OIDC-only → düzelt, sürüm 1.6.1.
  3. NPM CT numarası: README:41 "CT 206" ↔ `:253` "CT 207"; project.md `:38` ↔ `:253` → tek değer.
  4. `docs/TRIAGE_RECORD-faz2.6:124` "kod henüz deploy edilmedi" → güncelle.
  5. CHANGELOG `/kartlar` → `/cards`.
  6. `src/proxy.ts:12` istisnasında `icon.svg` yok → `curl -I /icon.svg` oturumsuz 200 mü, değilse ekle.

### F-18 · Veri kalitesi (uygulama içinden, kod değil) — P3 · M
- Kanıt: brain `projeler/homelab-finance.md:147` harcamaların ~yarısı kategorisiz, 'İnternet' kategorisi Trendyol/Amazon'u topluyor, hesaplar arası transferler `transfer_group_id` boş; `kisisel/finans/kart-harcama-kategorileri.md:36-38` ~2.500 satır, son tarih 2026-12-31.
- Adımlar: `/rules`'ta önizleme onaylı 10 kural ile en büyük 10 işyeri; 'İnternet' → 'Alışveriş/Online' bölünmesi; eski transferleri ADR-0009 çiftine bağlayan tek seferlik script.
- Bitti: kategorisiz satır oranı < %10; `transfer_group_id` NULL olan transfer sayısı 0.

---

## homelab-library

### L-01 · Sağlık ucu yok; deploy healthcheck ve smoke DB'ye dokunmuyor — P1 · S
- Kanıt: `src/app/api` altında `health` yok; `deploy/deploy.sh:42` ve `.github/workflows/deploy.yml:69` `/giris` bekliyor; `/giris` oturumsuzken DB'ye gitmiyor (`src/app/layout.tsx:37-38`).
- Adımlar: `GET /api/health` (`SELECT 1` + `STORAGE_DIR` yazılabilirlik), `src/proxy.ts:19` istisnası, deploy.sh/deploy.yml bu uca geçsin.
- Bitti: yanlış `DATABASE_URL` ile deploy kırmızı; `curl 127.0.0.1:3000/api/health` → `{"status":"ok","db":"up","storage":"rw"}`.

### L-02 · `shared/storage` (e-kitap + kapak) yedeği ve geri yükleme belgesiz — P1 · S
- Kanıt: `deploy/setup-ct208.md:146-149` dört kutu boş; dump/restore adımı hiçbir belgede yok; brain `projeler/homelab-library.md:68` CT 208'in vzdump'ta olduğunu söylüyor (repo doğrulayamıyor).
- Adımlar: runbook §10 "Yedek/Geri yükleme": `pg_dump -Fc homelab_library` + `rsync shared/storage`; PBS'ten CT restore adımı; atılabilir CT'de prova (kitap aç, e-kitap indir).
- Bitti: prova tarihi yazılı; setup-ct208 kutuları işaretli.

### L-03 · `password_hash` contract migration'ı yok; `argon2` ve `prettier` ölü bağımlılık — P1 · S
- Kanıt: `db/migrations/1718000000005_oidc-sso.js:28` kolon yalnız nullable; `src/types/db.ts:14`, `db/seed.sql:6`, `scripts/create-admin.ts:25`, `db/tests/rls/core.sql:10` hâlâ yazıyor; `package.json:27` `argon2` (0 import), `next.config.ts:14` `serverExternalPackages: ["argon2"]`; `CHANGELOG.md:521` "argon2 kaldırıldı" (kaldırılmamış); `prettier` yapılandırmasız/script'siz.
- Adımlar:
  1. Migration 0008: `dropColumn("users","password_hash")`; seed/rls/create-admin/types temizliği.
  2. `argon2` + `serverExternalPackages` satırını kaldır; `prettier`'ı ya kaldır ya `format:check` kapısı yap.
- Bitti: `npm ls argon2` boş; migrate-check up→down→up ve pgTAP yeşil; `\d users` kolon yok.

### L-04 · Service worker: sabit cache adı, sınırsız sayfa cache'i, test yok — P1 · M
- Kanıt: `public/sw.js:14-16` `hl-static-v1`/`hl-pages-v1` sabit → activate (`:38-39`) hiçbir şey silmez; `:126` her auth'lu sayfa `put`, süre/sayı sınırı yok, yalnız `?cikis=1`'de temizlenir (`src/components/ServiceWorkerRegister.tsx:19-23`); `tests/` altında sw/offline yok. `docs/adr/0004:41-46` çevrimdışı okuma konumu senkronu "ayrı iş".
- Adımlar:
  1. Build'de `sw.js`'e sürüm damgası (`hl-static-<sha>`), eski cache'ler activate'te silinsin.
  2. Sayfa cache'i 50 giriş LRU + 7 gün.
  3. Playwright: `context.setOffline(true)` ile `/offline` ve "Çevrimdışı sakla" (2 test).
  4. Okuma konumu: çevrimdışıyken `localStorage` kuyruğu, `online` olunca POST (e2e 1 test).
- Bitti: deploy sonrası DevTools'ta tek `hl-static-*`; 3 e2e yeşil.

### L-05 · Yetim dosya temizliği yok; storage sınırsız büyür — P1 · S
- Kanıt: silme yumuşak (`src/db/books.ts:426-441`); `src/`'de `unlink`/`rm(` yok; kapak/e-kitap güncellemesi eski dosyayı bırakır (`:402`).
- Adımlar: `scripts/storage-gc.ts` (DB'de referanssız `covers/`+`ebooks/` dosyaları; `--dry-run` varsayılan); aylık systemd timer (deploy kullanıcısı `--user`).
- Bitti: dry-run raporu; ilk koşu sonrası yetim sayısı 0; timer `list-timers`'da.

### L-06 · Hesap kalıcı silme (ASM-TS009-01, proje §8 silme politikası) uygulanmamış — P2 · S
- Kanıt: `src/db/users.ts:94` "silme değil"; `src/app/yonetici/kullanicilar/actions.ts:14` tek action pasif/aktif; `added_by … onDelete: SET NULL` şema hazır (`1718000000001_core-schema.js:66-68`).
- Adımlar: `hardDeleteUserAction` (admin, kendi hesabı hariç, iki adımlı onay, audit) + pgTAP.
- Bitti: pasif üye silinince `users` satırı yok, kitapları `added_by IS NULL`, okuma/puan kayıtları yok.

### L-07 · Toplu import tüm dosyaları belleğe alıyor — P2 · M
- Kanıt: `src/app/api/v1/aktar/route.ts:98` `Buffer.from(await file.arrayBuffer())`, `:84,:94` 50 dosya × 100 MB; CT 208 4 GB RAM (`deploy/setup-ct208.md:19`).
- Adımlar: dosyayı doğrudan `STORAGE_DIR`'e akıt (`pipeline`), ya da istek başına toplam 500 MB tavanı; 50 dosyalık sentetik import'ta RSS ölç.
- Bitti: tepe RSS < 1 GB; tavan aşımı 413.

### L-08 · CI/deploy: codegen kapısı yok, deploy `concurrency` yok, bellek sınırı yok — P2 · S
- Kanıt: `src/types/db.ts:3-4` "db-sync kapısı aktive edilecektir", `db.generated.ts` hiç üretilmemiş; `deploy.yml`'de `concurrency` yok (`ci.yml:10-12`'de var); `NODE_OPTIONS` repo genelinde yok (brain notu: runner ara sıra build'de düşüyor — repo doğrulayamıyor).
- Adımlar: CI'da `npm run codegen && git diff --exit-code src/types`; `deploy.yml`'e `concurrency: {group: deploy-production, cancel-in-progress: false}`; build adımına `NODE_OPTIONS=--max-old-space-size=3072`.
- Bitti: codegen diff boş; ardışık 3 push'ta deploy'lar sıralı; build OOM yok.

### L-09 · Coverage kıl payı; bileşenler ve API route'ları ölçüm dışı — P2 · M
- Kanıt: `vitest.config.ts:14-21` %80 × 4 metrik, yalnız `src/lib/**`; brain notu branch %80,22 (doğrulanamadı). Testsiz: `releaseNotes.ts`, `authz.ts`, `utils.ts`, `theme.ts`; bileşenler (`library3d/textures.ts` 502 satır, `FilterBar.tsx` 218) tamamen testsiz; `src/app/api/**` coverage dışı.
- Adımlar: 4 lib modülüne test; `include`'a `src/app/api/**` + 8 route için 401/404/400 testi.
- Bitti: branches ≥ %85 (`npm run test:coverage` özeti).

### L-10 · a11y taraması eksik sayfalar; `/surum` yetim — P2 · S
- Kanıt: axe'siz `/yazarlar`, `/kitaplar/[id]/oku`, `/ayarlar`, `/kutuphane`, `/offline`; `/surum`'a link yok (`releaseNotes.ts:8` yorum, `version.spec.ts:4-5` rozet modala taşındı).
- Adımlar: 4 sayfaya `@axe`; `/surum`'u sil ya da modala yönlendir.
- Bitti: `grep -c "@axe" tests/e2e/*.ts` toplamı 11; `/surum` 404 ya da 308.

### L-11 · İndirme uçlarında hız sınırı yok; kapak MIME sabit; kitapyurdu kazıyıcı sessiz düşüyor — P2 · S
- Kanıt: `…/dosyalar/ekitap/[fileId]`, `…/kapak/[bookId]` auth var RL yok; `kapak/[bookId]/route.ts:30` sabit `image/jpeg`, `src/lib/coverDownload.ts:48-51` `image/*` kabul; `src/lib/kitapyurdu.ts:196-197,223-224,265-266` JSON-LD yoksa sessiz null; fixture yalnız satır içi.
- Adımlar: indirme için ayrı sayaç (60/15 dk); magic-byte ile tür + uzantı; `console.warn("kitapyurdu: JSON-LD yok")` + canlıdan kaydedilmiş detay HTML fixture'ı.
- Bitti: 429 testi; PNG kapak `image/png`; fixture testi yeşil.

### L-12 · CSP ve Permissions-Policy yok — P2 · S
- Kanıt: `deploy/Caddyfile:17-21` HSTS+nosniff+XFO; `next.config.ts:21-28` XFO+nosniff+Referrer; `Content-Security-Policy`/`Permissions-Policy` repoda yok; `CHANGELOG.md:244,559` "CSP korunur" diyor.
- Adımlar: Caddy'de CSP (`default-src 'self'; worker-src 'self' blob:; img-src 'self' data: blob:`), `Permissions-Policy: camera=(self)`; barkod, 3D, EPUB/PDF okuyucu elle doğrula.
- Bitti: securityheaders.com A; üç özellik çalışıyor.

### L-13 · Faz 2 "öneriler" ve n8n/HA entegrasyonu: hiç kod yok, karar da yok — P2 · S
- Kanıt: `project/homelab-library.md:52`; `src/`'de `öneri|recommend`, `n8n|webhook` eşleşmesi yok.
- Adımlar: karar; "evet" ise token'lı salt-okunur `GET /api/v1/ozet` (toplam/okunuyor/bu ay) ve `/istatistik`'te "okumaya aday" bloğu; "hayır" ise proje dosyasından sil.
- Bitti: proje dosyası Faz 2 satırı güncel; varsa n8n'den 200 alınmış.

### L-14 · Üretimde hata izi yok — P2 · S
- Kanıt: `src/app/error.tsx:17-19` yalnız dev'de log; `src/` genelinde 3 `console.*`; `audit_log` yalnız login/admin.
- Adımlar: `error.tsx`'te prod'da `digest` + route'u journald'ye; `reportError` yardımcı.
- Bitti: yapay 500 `journalctl -u homelab-library`'de görünüyor.

### L-15 · Belge sapmaları — P3 · M
- Kanıt / bitti:
  1. `project/homelab-library.md`: `:27` `next_review_due 2026-09-11` geçti; `:41` CT 208 "henüz oluşturulmadı"; `:51` Faz 1 "planlandı"; `:54-55` "ödünç takibi kapsam dışı" ↔ `book_loans` var; **`:63` Red Line #2 "hesapları yalnızca yönetici oluşturur" ↔ `src/auth.ts:82-84` JIT provisioning** (kapı Authelia grubu — red line yeniden yazılmalı); `:110,112` `password_hash`/argon2id; `:94-96` dış bağımlılıkta `kitapyurdu.com`, `img.kitapyurdu.com`, `archive.org` yok; `:9` "8 mockup" ↔ 5 dosya → 1.1.0 revizyonu.
  2. `.agents/working-context.md` (2026-06-12): credentials anlatımı, pin `6e7063a` ↔ gitlink `85a4a05`, "KALAN: ilk ISBN doğrulaması" (1.19.5'te yapıldı), "parolaları yöneticiye taşı" (kapanış izi yok) → güncelle ya da arşivle.
  3. `deploy/setup-ct208.md`: `:53` staging sudoers, `:89-90` `.env.staging`, `:99` `ADMIN_PASSWORD` (create-admin "parola yok"), `:111` olmayan staging service, `:139-140` "otomatik staging" ↔ `deploy.yml` otomatik production; `.env` şablonunda `DATABASE_URL_OWNER`, `AUTH_AUTHELIA_*`, `HOMELAB_APPS_URL` yok → tek-ortam/OIDC'ye göre yeniden yaz.
  4. README: CI kapı listesi (`:70-72`) e2e+a11y ve changelog'u saymıyor; `/offline`, "çevrimdışı sakla", `/kutuphane` anılmıyor.
  5. `.env.example`'a `STORAGE_DIR` (`src/lib/storage.ts:16`).
  6. Bayat yorumlar: `src/auth.config.ts:5` argon2/edge, `src/app/manifest.ts:5-6` "SW yok", `src/types/db.ts:3-4`.
  7. `ci.yml:19` `postgres:17` major pin → `17.10` (ASM-TS001-01).

### L-16 · Sürüm hizası — P3 · S
- Kanıt: `package.json:54` `@types/node ^22` ↔ `:5` `engines.node >=26`; `kysely ^0.28` / `kysely-codegen ^0.18` (finance/health 0.29 / 0.20).
- Adımlar: `@types/node@^26`; kysely/codegen'i kardeşlerle eşitle; X-05 ile renovate.
- Bitti: üç repoda `npm ls kysely kysely-codegen` aynı major.minor.

---

## homelab-health

### H-01 · Watch zip tamamı belleğe alınıyor; açılma oranı tavanı yok; kilit ayrıştırma boyunca tutuluyor — P1 · M
- Kanıt: `src/app/api/v1/import/watch/route.ts:91` ve `src/lib/actions/watch-xml.ts:44` `Buffer.from(await file.arrayBuffer())` (80 MB tavan); `src/lib/health/watch/zip-import.ts:110-115` açılan bayt sayılmıyor; `:129-131` advisory kilit + havuz bağlantısı tüm ayrıştırma boyunca. ADR 0003:35 "~yarım GB tepe bellek" kabulü.
- Adımlar:
  1. `req.body` akışını sha256 + fflate'e doğrudan ver (arrayBuffer yok).
  2. Açılan toplam bayt > 2 GB ya da oran > 50× → `VALIDATION`; sentetik zip-bomba testi.
  3. Kilidi ayrıştırmadan sonra, yalnız yazma transaction'ında al.
- Bitti: 80 MB gerçek export'ta tepe RSS < 300 MB (ölçülmüş); bomba testi yeşil.

### H-02 · PDF MIME denetimi tarayıcı beyanına güveniyor — P1 · S
- Kanıt: `src/lib/health/pdf/extract.ts:43` `if (file.type && file.type !== "application/pdf")` — boş `type` geçer; `%PDF-` kontrolü yok; tehdit modeli `:38` "MIME kontrol" vaadi.
- Adımlar: ilk 5 bayt `%PDF-` değilse `VALIDATION`; `extract.test.ts` +2 (boş type, yanlış içerik).
- Bitti: `.txt` dosyasını `.pdf` adıyla yüklemek 422.

### H-03 · CI `next build` koşmuyor; smoke yalnız `/api/health` — P1 · S
- Kanıt: `.github/workflows/ci.yml` 9 job, build yok (`LESSONS.md:34-38`); `deploy.yml:60-66` smoke = 200.
- Adımlar: CI'a `build` job'ı (homelab-ui deploy key zaten var); smoke'a `/` → 307 `/login`.
- Bitti: build kıran bir PR CI'da kırmızı; smoke iki kontrol.

### H-04 · e2e yok; MVP ölçütü "2 Authelia kimliğiyle uçtan uca izolasyon" otomatik değil — P1 · L
- Kanıt: `ci.yml:4,234` "BEKLİYOR"; `package.json`'da playwright yok; `project/health.md:29` ölçüt; CHANGELOG'da uçtan uca koşu kaydı yok.
- Adımlar: F-06 ile aynı test kimliği yaklaşımı; Playwright: owner/aile × `/`, `/tahliller`, `/kisiler` (6 senaryo: aile başkasının kişisini görmez, silme düğmesi yok, `/audit` 403); 1 `@axe`.
- Bitti: CI `e2e` yeşil; `project/health.md:29` "otomatik" olarak işaretli.

### H-05 · Deploy sırası finance'tan farklı: migration healthcheck'ten önce — P1 · S
- Kanıt: `deploy.yml:46-58` build → migrate → healthcheck; `README.md:42` "healthcheck düşerse şema ilerlemiş olur"; finance 0.43.3 (ADR-0007) migration'ı healthcheck'ten sonraya aldı.
- Adımlar: finance sırasına hizala (geçici portta healthcheck → migrate → symlink) **ya da** farkı ADR'de gerekçelendir; CI'da `migrations/`'ta `DROP|RENAME|SET NOT NULL` görünce uyarı adımı (`grep` + `::warning`).
- Bitti: iki repoda aynı sıra ya da ADR'de "bilinçli fark" satırı; uyarı adımı bir PR'da tetiklendi.

### H-06 · Vision kanalı canlıda hiç çalışmadı; onay sunucu tarafında parametre değil — P1 · S
- Kanıt: `CHANGELOG.md:549` "CT 214'te `ANTHROPIC_API_KEY` tanımlı değil"; `:264` pencere görsel doğrulanmadı; `src/lib/actions/upload.ts:96-98` "action'ı çağırmak onaydır", kapı yalnız env (`:105`) + `yerel_basarisiz` (`:122-129`).
- Adımlar: karar — (a) kanalı aç: anahtar + anonim PDF ile uçtan uca 1 deneme, `requestVision(dosyaId, kisiId, onay: "PDF buluta gider")` literal parametresi + negatif test; (b) kanalı ADR ile kaldır (ADR 0002 süperse).
- Bitti: ADR'de tarihli karar; (a) ise test + `audit_log`'da 1 `egress` satırı.

### H-07 · Watch kategori/antrenman/gün-özeti sürekli yolda içe alınmıyor — P1 · M
- Kanıt: `src/lib/health/watch/xml.ts:89` `return null; // kategori/olay + workout → kapsam dışı (v1)`; `docs/adr/0003:22` "ertelendi"; `watch_kategori_olay` (33 k) ve `watch_antrenman` (38) 2026-07 backfill'inde donmuş.
- Adımlar: `classifyRecord` üç tabloyu da döndürsün; `/watch`'ta en az bir kategori metriği (uyku evresi/antrenman); `watch-zip-import.test.ts` +3.
- Bitti: bir sonraki otomatik import'tan sonra `SELECT max(baslangic) FROM watch_antrenman` import tarihinden ≤ 7 gün geride.

### H-08 · Health ucu sığ; kuyruk yaşı ve import hataları izlenmiyor — P2 · M
- Kanıt: `src/app/api/health/route.ts:17-30` yalnız `SELECT 1`; `*_istek` yaşına bakan sorgu yok; `zip-import.ts:167-172` ledger yalnız başarıda, hata `:179` `console.error`; n8n akışı repoda yok (`docs/adr/0011:43`). Kuyrukta takılan satır daha önce yaşandı (`CHANGELOG.md:279`).
- Adımlar:
  1. `watch_import`'a `durum`/`hata_kodu` (expand) ya da audit `import_hata` satırı.
  2. Owner-only `/api/health?derin=1`: `belirtec_bilgi_istek` ve `tahlil_degerlendirme_istek` içinde > 3 gün bekleyen sayısı, son `watch_import`, son `yukleme-supur`.
  3. n8n: eşik aşımında Telegram; akış JSON'u `deploy/n8n/` altına (finance deseni).
- Bitti: uç 4 alan döndürüyor; sahte 4 günlük istekle alarm mesajı geldi.

### H-09 · Birim normalizasyonu yok (PRP-006); trend serisi birim değişimini süzmüyor — P2 · M
- Kanıt: `src/lib/actions/tahlil.ts:39-48` sorguda birim koşulu yok, `:68` `birim: noktalar.at(-1)?.birim`; tek normalizasyon `vital-seri.ts:10` (yalnız vitaller); karşılaştırma "birim değişti" deyip atlıyor (`CHANGELOG.md:162`).
- Adımlar: `getTrend` seriyi (belirteç, birim) çiftine böl; bilinen çiftlerde dönüşüm tablosu (mg/dL↔mmol/L glukoz, kolesterol, kreatinin); karışık birim fixture testi.
- Bitti: karışık fixture'da 2 seri ya da dönüştürülmüş tek seri; grafikte birim etiketi.

### H-10 · Yaş/cinsiyet referans aralığı (PRP-002'nin ikinci yarısı) yok — P2 · M
- Kanıt: `src/lib/health/reference.ts:14-31` yalnız PDF'teki sınırlar; `cinsiyet`/`dogum_tarihi` `src/lib/health` altında okunmuyor.
- Adımlar: katalogdaki 52 belirteç için cinsiyet/yaş bandı varsayılan aralığı (repo içi özgün tablo, ADR 0004 kuralı); PDF sınırı yoksa bu tablo; `reference.test.ts`'te cinsiyete göre farklı sonuç.
- Bitti: referanssız elle girişte "dikkat" hesabı boş değil; test yeşil.

### H-11 · Bakım ucu watch anahtarını paylaşıyor (ADR 0012 ertelemesi) — P2 · S
- Kanıt: `src/app/api/v1/bakim/yukleme-supur/route.ts:25` `WATCH_IMPORT_API_KEY`; `docs/adr/0012:43`.
- Adımlar: `BAKIM_API_KEY` env + 503 kapısı; `.env.example`; n8n credential ayrı.
- Bitti: watch anahtarı döndürülünce süpürücü çalışmaya devam ediyor.

### H-12 · Otomatik watch yolunda atlanan metrik görünmez (ADR 0011 açık maddesi) — P2 · S
- Kanıt: `docs/adr/0011:52,66-67` "ertelendi … uç yalnız eklenen sayıları döner".
- Adımlar: yanıta `atlananMetrik[]`; n8n Telegram mesajına ekle.
- Bitti: bilinmeyen birimli sentetik kayıt mesajda listeleniyor.

### H-13 · Coverage 4 dosyaya bağlı; `tahlil-core` birleştirme mantığı tek dolaylı senaryoyla sınanıyor; parser fixture'ı yok — P2 · M
- Kanıt: `vitest.config.ts:16-22` include = `reference.ts, pdf/parse.ts, schemas/health.ts, app-result.ts`; `tahlil-core.ts` (163 satır, 0.36.0) yalnız `confirm-extraction-yaris.test.ts:134`; `tests/fixtures/` yok; 0.22.2'de 6 uydurma değer değerlendirmeye kadar gitti.
- Adımlar: `tahlil-core` için "aynı satır atlanır / yeni eklenir / değer çakışır" 3 test; include'a `tahlil-core`, `watch/plan`, `kisi-arsivi`; `tests/fixtures/<lab>.txt` + beklenen JSON golden testi (≥3 lab).
- Bitti: include listesi +3; golden test 3 lab; coverage ≥ %80 korunuyor.

### H-14 · Hız sınırı boşlukları — P2 · S
- Kanıt: `src/app/api/health/route.ts:24` kimliksiz + sınırsız (`proxy.ts:22` WAN'a açık); `src/lib/actions/tema.ts`, `watch.ts` `rateLimit` yok.
- Adımlar: `/api/health` IP başına 30/dk; `setTemaRengi` 20/dk; 2 test.
- Bitti: 429 testleri yeşil.

### H-15 · Genel doküman deposu ve `/dosyalar` listesi yok; ilaç takibi reçete listesinden ibaret — P2 · M
- Kanıt: `migrations/1753000000000_core-schema.js:44` `tur IN ('tahlil_pdf','diger')`, `'diger'` kodda hiç yazılmıyor; `CHANGELOG.md:253` "'Dosyalar' listesi bu sürümde yok" (sonrasında da yok); `project/health.md:47` "ilaç takibi" planlandı, `ilac_kullanim`/hatırlatma tablosu yok.
- Adımlar: kapsam ADR'si (doküman deposu + ilaç takibi: yap/erteleme/sil); "yap" ise `/dosyalar` (liste + indirme + `tur='diger'` yükleme; KVKK envanteri `dosya`'yı zaten kapsıyor).
- Bitti: ADR'de karar; varsa sayfa + 2 test.

### H-16 · Yedek/geri yükleme ve `watch_olcum` saklama planı yok — P2 · S
- Kanıt: `docs/adr/0013:66` "WAL arşivi ve `pg_dump` cron'u yok"; `*.md` içinde restore yok; `watch_olcum` 2,4 M satır, indeks var (`1784300000000:25`), partition/retention yok.
- Adımlar: `docs/runbook-restore.md` (PBS CT 200 restore, `dosya` bytea doğrulama, Authelia break-glass) + yılda bir prova; `watch_olcum` aylık partition kararı ADR.
- Bitti: prova tarihi yazılı; ADR'de karar.

### H-17 · Log/hata raporlama ve `overrides` — P2 · S
- Kanıt: 27 dosyada 63 `console.*`; `docs/threat-model.md:56` "pino log PII maskeleme" (pino yok); `package.json:50` `sharp ^0.35.4` override gereksiz (`next@16.4.3` `^0.35.5` istiyor); ADR 0005 `eslint@10` ertelemesi.
- Adımlar: ya TM satırını "console + hata sınıfı" yap ya minimal JSON logger + istek id; `sharp` override'ını sil, `npm audit --omit=dev` 0.
- Bitti: TM ile kod tutarlı; override listesi gerekçeli.

### H-18 · Kullanılmayan kolon `tahlil_oturum.anahtar_belirtec` — P3 · S
- Kanıt: `src/types/db.ts:241`; `src/` içinde başka referans yok.
- Adımlar: ADR notuyla düşür (contract, bir sonraki sürüm) ya da kullanımını belgele.
- Bitti: kolon yok ya da ADR'de satır.

### H-19 · Belge sapmaları — P3 · S
- Kanıt / bitti:
  1. `project/health.md:3` "Versiyon 0.1.0" (paket 0.37.3); `:47` faz2 "planlandı" (watch/ingest/ekler bitti); `:124` "webhook yok" (ADR 0011/0012 n8n uçları) → faz tablosu satır satır işaretli.
  2. `db/schema-design.md:3` "henüz DDL uygulanmadı" → "uygulanıyor, kanonik kaynak `migrations/`".
  3. `docs/threat-model.md`: RR-8 iki kez (`:99`, `:104`) → RR-9; `trust_boundaries` (`:11-29`) `/api/disa-aktar`, `health_sage`/`sage_ro`/`memory_ozet_ro` rollerini içermiyor; `:27-29` açılmamış `health_admin` havuzu → yeniden yaz.
  4. `docs/adr/0011:3` "Öneri" → "Kabul (uygulama 0.26.0)".
  5. `saglik` DB'nin 2026-07-18'de düşürülmesi (brain `kararlar/2026-07-18-saglik-brain-ayrismasi.md:41`) repoda hiç kayıtlı değil: `CHANGELOG.md:954` son söz "korunur", `docs/adr/0001` kapanış notu yok → CHANGELOG'a tarihli "Notlar" satırı + ADR 0001'e kapanış.

---

## homelab-memory

### M-01 · Kaynak erişilebilirliği izlenmiyor; kesinti journald'de iz bırakmıyor — P1 · S
- Kanıt: `app/api/health/route.ts:1-6` "Kaynak (brain, sage DB) yoklaması burada yok", yanıt `{status:"ok"}`; `src/lib/kaynak/sonuc.ts:15-21` `erisilemez()` loglamıyor; repoda tek `console.error` `src/lib/kaynak/olay-yaz.ts:36`.
- Neden: brain/sage/ha/sys/health/finance düşünce yalnız sayfa içi rozet; CT 207 probu ve journald göremez.
- Adımlar: (1) oturum-kapılı `GET /api/kaynaklar` (7 kaynak, son başarılı okuma zamanı, hata); (2) `erisilemez()` içinde kaynak başına dakikada bir `console.warn`; (3) sys `layer0.memory` probuna yeni ucu bağla.
- Bitti: brain-mcp durdurulunca 1 dk içinde journald'de satır ve uçta `brain: down`.

### M-02 · Hafıza sağlığı örnekleyicisi: yazım hatası yutuluyor, zamanlayıcı yok — P1 · S
- Kanıt: tetik yalnız sayfa yüklemesi (`app/(panel)/_components/SidebarSayaclari.tsx:51-55` → `src/lib/genel/okuma.ts:45-49` `void ornekYaz(…)`); `src/lib/saglik/gecmis.ts:45-51` `catch { return false; }` logsuz; `gecmis.ts:4-7` "panelin açılmadığı gün satırsız kalır" (bilinçli).
- Neden: `MEMORY_DB_URL` bozulursa 30 günlük trend sessizce durur.
- Adımlar: `yaz()` hatasını `console.error` + `/hafiza-sagligi` kartında "son örnek yazılamadı: <tarih>" rozeti; isteğe bağlı günlük `systemd --user` timer ile `curl` tam yükleme.
- Bitti: DSN bozukken kartta rozet; journald'de hata satırı.

### M-03 · Onay uygulamasının dört sınırı brain-mcp tarafında çözülmeli — P1 · M
- Kanıt: `src/lib/onay/uygula.ts:227-228` "yeni not birebir yazılamıyor (brain_write_note frontmatter'ı kendisi kurar)"; `:237-238` "uygulanamaz: hedef dogrulandi: true"; `:88-90` "kisayol: brain-mcp yazma araçları commit hash'i dönmüyor … yanlış hash"; `:81` sha reddi Türkçe metin regex'i `/okunduğundan beri değişmiş/`.
- Neden: rutinler yeni-not ve doğrulanmış-not maddesi üretmeye devam ediyor, panel kabul edemiyor; `onay_karari.commit` yanlış olabilir; brain-mcp mesaj metni değişirse sha reddi "hata"ya düşer.
- Adımlar (brain-mcp): `brain_update_note`/`brain_write_note` dönüşüne `commit` alanı ve yapısal hata kodu (`isError` + `code: sha_mismatch`); `brain_write_note(ham_metin=…)` seçeneği ya da ürün kararı "yeni-not maddeleri yalnız ret/ertele". Panel: metin regex'i yerine kodu oku.
- Bitti: `uygula.ts`'te regex ve "kisayol" yorumu yok; `uygula.test.ts`'te commit alanı senaryosu.

### M-04 · Test boşlukları: `agent:admin` reddi ve kilit SQL'i kanıtsız — P2 · S
- Kanıt: `src/auth.ts:30-32` `throw new Error("AccessDenied…")`; `src/auth.config.test.ts:2` "proxy.ts import edilmez" → `profile()` test dışı; `src/lib/onay/depo.ts:3` "Testler `Sorgu` yerine in-memory depo verir", `:40-47` `TALEP_SQL` (`ON CONFLICT … 5 minutes`) hiç PG'ye karşı koşmuyor; `src/lib/genel/okuma.ts` testsiz.
- Adımlar: `profile` eşlemesini saf fonksiyona çıkar + grupsuz/yanlış gruplu profil testi; `migrate-check` job'ına kilit SQL'ini gerçek PG'de deneyen `node --test` adımı; `okuma.ts` için 2 test.
- Bitti: 4 yeni test; CI `migrate-check`'te PG'li adım yeşil.

### M-05 · e2e yok, hata sınırları eksik, arama önbelleksiz — P2 · S
- Kanıt: `.github/workflows/ci.yml:4` "BEKLİYOR: e2e/a11y"; `app/global-error.tsx`, `app/not-found.tsx` yok (yalnız `app/(panel)/error.tsx`); `CHANGELOG.md:58` "aramayı önbelleğe almaz", `rate.?limit` grep boş.
- Adımlar: test oturum çerezi ile Playwright smoke (`/giris` 200, `/` 307, `/onay` render); `global-error` + `not-found` (Türkçe); `/ara` için 10 sn anahtar-başına önbellek.
- Bitti: CI'da `e2e` job'ı; `/olmayan` Türkçe 404; aynı sorgu 10 sn içinde kaynaklara ikinci kez gitmiyor.

### M-06 · Smoke düşünce otomatik geri alma yok — P2 · S
- Kanıt: `.github/workflows/deploy.yml:65-71` smoke yalnız `/api/health`, düşerse `exit 1`; `deploy/rollback.sh` elle.
- Adımlar: smoke FAIL → `deploy/rollback.sh production`; bir kez bilerek kırık smoke ile prova.
- Bitti: prova kaydı; `current-production` önceki release'e döndü.

### M-07 · Bağımlılık hizası — P2 · S
- Kanıt: `package.json:21` `next-auth ^5.0.0-beta.32` (caret GA'yı da kapsar); `:39-42` `overrides` gerekçesi CHANGELOG'da yok; `:6` `engines >=26` ↔ `:29` `@types/node ^22`.
- Adımlar: tam pin; overrides gerekçesi CHANGELOG'a; `@types/node@^26`. (İlk listedeki X-03/X-05 ile aynı tur.)
- Bitti: `npm ls next-auth` tek tam sürüm.

### M-08 · Belge sapmaları — P3 · S
1. `README.md:26` "0.16.0 …" ↔ `package.json` 0.17.5; `/kisisel` ve ha/sys/health/finance adaptörleri README'de yok → Durum paragrafı 11 görünümle yeniden.
2. `CLAUDE.md:48` okuma kaynakları `job_runs`'ı saymıyor (`src/lib/kaynak/sage.ts:109-113`).
3. `CLAUDE.md:54-57` "roller migration ile açılır" ↔ `migrations/1791900000000_onay-karari.js:19-21` "ROLÜN KENDİSİ ÜRETİMDE ELLE AÇILIR" → "roller elle (CT 200), hakları migration ile".
4. `CLAUDE.md:36` açık uçlar git dışı `devir.md` → `docs/GOREVLER.md`'ye "Açık uçlar" bölümü (sage §1–5 hariç); kapı tablosu `:20-26` G1/G3/G4/GA "—" → tarih.
5. `docs/brain-erisimi.md:80-85` ve `GOREVLER.md:414-415` "CT 210 allow-list açık" ↔ Fable tahtası 313-a (2026-10-16) nft izin listesi canlı → kapat.
6. `CHANGELOG.md:181` "Auth.js `session.maxAge` karar bekliyor" ↔ 2026-10-09 kararı "kalsın" → kapat.
7. `CHANGELOG.md:91` brain ADR §2 `saglik_ornegi` veri türünü anmıyor → brain `kararlar/2026-09-30-hafiza-paneli.md` revizyonu.
8. Açıkla Adım 7 yer tutucu: `app/(panel)/acikla/page.tsx:392` "Faz 2'de gelir", `src/lib/acikla/acikla.ts:164` → `onay_karari` sorgusu + `acikla.test.ts` +1.
9. `docs/tasarim-ia.md:82-84` Akış şeritleri ve `:206-208` "İlgili" bloğu kodda yok (`GOREVLER.md:846-847` "kapsam dışı kaldı") → IA revize ya da F4-4 görevi.
10. `.env.example:5,8,11` F1-4 öncesi yorumlar; `HOMELAB_APPS_URL` repo kodunda okunmuyor (homelab-ui içinde — doğrulanamadı).
11. 12 `kisayol:` notu (`depo.ts:38-39` tek süreç, `uygula.ts:182-183` çift olay, `olay.ts:81` korelasyon indeksi yok, `akis.ts:341`, `tahta.ts:48`) → GOREVLER'e borç satırı.

---

## homelab-agent-sys

### S-01 · `/token/upload` kimliksiz `.env`'e yazıyor; ~41 yol yalnız nftables'a emanet; repo nft kopyası canlıdan geride — P1 · S
- Kanıt: `homelab_agent_sys/api.py:1434-1438` `@app.post("/token/upload")` token/loopback kontrolü yok; `ops/nftables.conf:29` `AGENT_API_ALLOW = { .29, .21, .30 }` (memory CLAUDE.md panel `.40`'ın 2026-10-02'de eklendiğini söylüyor → canlı dosya repodan farklı, doğrulanamadı); `whatsapp-sidecar/index.js:47` `SECRET = … || ""` (ajan tarafı fail-closed, sidecar sessizce 403 alır).
- Neden: allow-list'teki herhangi bir host OAuth token'ı değiştirebilir; repo ↔ canlı nft drift'i.
- Adımlar: `/token/upload` → `_require_loopback` ya da `HOST_EXEC_TOKEN`; canlı `/etc/nftables.conf`'u repoya senkronla; `index.js`'te boş SECRET → `process.exit(1)` (ha'ya `/sidecar-esitle` ile).
- Bitti: tokensiz upload 401/404; `diff ops/nftables.conf <(pct exec 207 cat /etc/nftables.conf)` boş; secret'sız sidecar kalkmıyor.

### S-02 · Bağımlılık pinleri yok; kurulu küme yeniden üretilemez — P1 · S
- Kanıt: `requirements.txt` 16 satır `>=,<` aralığı, `==` yok, lock yok; autodeploy `pip install -q -r` (`ops/homelab-agent-sys-autodeploy.sh:217`); `config/thresholds.yaml:300-302` "unpinned `mcp` 2.0.0 … all four died" (2026-07-29 kesintisi); `requirements.txt:32` `anthropic` hiçbir yerde import edilmiyor; `:27` "CT 209" yorumu ha'dan kopya.
- Adımlar: CT 207 venv'inden `pip freeze > requirements.lock`; autodeploy `-r requirements.txt -c requirements.lock`; `anthropic`'i sil; yorumu düzelt. (ha için aynı — Y-02.)
- Bitti: lock repoda; temiz venv'de `pip install -r requirements.txt -c requirements.lock` canlıyla aynı sürümleri kuruyor.

### S-03 · DB saklama politikası olmayan 6 tablo — P1 · S
- Kanıt: `metrics` 365 g ve `audit_events` 90 g var (`migrations/0001:38-39,132`); `anomalies`, `ai_consultations` (tam yanıt metni), `actions`, `hourly_summaries`, `kota_olcumleri` (her `claude -p` bir satır), `eval_runs` için DELETE yok (grep boş).
- Adımlar: `pg_total_relation_size` ile 6 tabloyu ölç; hygiene işine `ai_consultations` 180 g (ya da yanıt gövdesini kırp), `kota_olcumleri` 180 g, `anomalies`/`actions` 2 yıl; `docs/05-database.md`'ye saklama tablosu.
- Bitti: hygiene koşusu log'da tablo başına silinen satır sayısı; docs/05'te tablo.

### S-04 · Deploy kapısı "koşamadı" (rc2) her deploy'u kapısız geçiriyor — P1 · S
- Kanıt: `ops/deploy-gate.sh` rc2 = koşamadı (eksik `.env`/venv) → autodeploy kapısız devam eder, alarm var ama `bad_sha` yok (`autodeploy:254-265`).
- Adımlar: ardışık 3 rc2'de deploy'u durdur + `bad_sha`; `tests/`'e senaryo.
- Bitti: sahte `.env` yokluğunda 3. deploy durdu ve alarm "kapı 3× koşamadı".

### S-05 · Kota ve kuyruk düşüşü alarmsız — P2 · S
- Kanıt: `self_health.py:145-146` `layer4.self.quota_pct` yazılıyor, `config/thresholds.yaml`'da kural yok (`:313` yalnız yorum); `olay_kuyruk.py:42` `KUYRUK_MAX = 200`, `:89-94` taşma en eskiyi düşürür, metrik/anomali yok.
- Adımlar: `quota_pct ≥ 95` `notify_only` kuralı (ya da `docs/decisions.md`'ye "bilerek alarmsız"); `layer4.self.olay_kuyruk_dusen` metriği + `value_max: 0`.
- Bitti: sahte değerle iki anomali açılıyor.

### S-06 · Test boşlukları ve golden tablo ↔ canlı katalog — P2 · M
- Kanıt: hiçbir testte geçmeyen 15 modül (`consult_context.py` 536, `scheduler.py` 500, `checkers/layer3_hw.py` 310, `consult_grader.py` 301, `baseline.py` 279, `replay.py` 251, `service_updates.py` 230, `email_notify.py` 189 …); checker 6/10 testsiz; `tests/test_safety_golden.py` 105 araç ama `/ai/tools-catalog`'a yeni eklenen araç tablo elle güncellenmedikçe görünmez.
- Adımlar: `consult_context` istem derleyicisi ve `layer3_hw` parse'ı için fixture testi; deploy kapısına "canlı katalog ad kümesi ⊆ golden CATALOG" kontrolü.
- Bitti: 2 yeni test dosyası; kapı adımı kataloga yeni araç eklenince kırmızı.

### S-07 · Tasarım borçları: escalation ladder, A7 skill vendor, docs/07 B2 — P2 · M
- Kanıt: `docs/08-escalation-ladder-design.md:3` "Durum: tasarım (henüz uygulanmadı)", §12 12 açık karar; `homelab_agent_sys/` altında escalation modülü yok ama pano `JOBCAT` `escalation_tick` sayıyor (`static/dashboard/index.html:1805`); `docs/cross-pollination-plan.md:48-50` A7 ".claude/skills vendor'lamak gerekir (karar)", son satır "envelope split, RUNBOOK_SUGGESTION, agentdb_search_memory ⏳ kalan"; `docs/07:36` W9 ertelendi; `api.py:715-717` `/anomalies/{id}/consult` senkron.
- Adımlar: §12 sorularını tek satırla cevapla (yap/kapat) ve docs/08'e tarihli durum; A7 için 1 hafta "yanlış tool/param" deny sayımı → sıfıra yakınsa kapat; B2 `BackgroundTasks` + 202; plan tablosunda ⏳ satırlarını numarala ya da "reddedildi" yaz.
- Bitti: docs/08 başlığında tarih; cross-pollination tablosunda ⏳ yok; manuel consult 202 dönüyor.

### S-08 · systemd sertleştirme ve autodeploy birimi — P2 · S
- Kanıt: `systemd/homelab-agent-sys.service:9-44` `User=homelab`, `NoNewPrivileges`, `CapabilityBoundingSet` var; `ProtectSystem/ProtectHome/PrivateTmp/RestrictAddressFamilies` yok (sidecar da); autodeploy `.timer/.service` repoda yok.
- Adımlar: `ProtectSystem=strict` + `ReadWritePaths=/opt/homelab-agent-sys /var/lib/homelab-agent-sys` (`/token/upload` `.env` yazımını ve `claude -p` `~/.claude`'u ölç); timer'ı repoya al (unit senkronu zaten var).
- Bitti: `systemd-analyze security homelab-agent-sys` "MEDIUM" altı; `systemd/` 4 dosya.

### S-09 · Pano: kalıcı token, bayat JOBCAT, mock blok — P2 · S
- Kanıt: `static/dashboard/index.html:2220` `localStorage.getItem('hlExecToken')` (PVE shell token kalıcı); `:1805` `JOBCAT` 14 var olmayan/ha işi (`escalation_tick`, `ha_*`, `habit_analysis` …), 6 gerçek iş kategorisiz; `:1283` "v0.8.1 / F8 MOCK DATA" bloğu.
- Adımlar: `sessionStorage`; JOBCAT'i `/jobs`'tan türet; mock bloğu sil.
- Bitti: sayfa kapanınca token yok; kategorisiz iş 0.

### S-10 · Ölçülmeyi bekleyen kararlar — P2 · S
- Kanıt: `docs/decisions.md:1723` "gölge kanaryası … Ahmet'in onayı gerekir" ↔ 0.105.0'da kodlandı (`ai_consult.py:79-93`), varsayılan kapalı, hiç koşmadı; `:1641` "LAN gateway ölümü … yeterince ölçülmedi, `full` bırakıldı".
- Adımlar: karara "revize" satırı; 1 hafta `CLAUDE_CODE_HOURLY_SHADOW_MODEL=sonnet`; `ai_consultations`'ta 30 günlük `connectivity.gateway` consult sayısı/sonucu.
- Bitti: docs/09 ve decisions.md'de iki rakam.

### S-11 · Ajan DB yedeği: belge ile repo ayrışıyor — P2 · S
- Kanıt: `docs/05-database.md:268-274` "pg_receivewal + günlük pg_dump" der; repoda birim yok; `config/backup_expectations.yaml:100-109` CT 207 bütün-CT RPO 24 s.
- Adımlar: CT 207'de `systemctl status pg_receivewal@17-main` + `ls /var/backups/pgdumps`; varsa timer'ı repoya al, yoksa docs/05'i "yalnız vzdump/PBS, RPO 24 s" yap.
- Bitti: belge ile kutu aynı; repoda birim ya da düzeltilmiş paragraf.

### S-12 · Belge sapmaları — P3 · S
1. `docs/capabilities.md` §7 10 yol eksik (`/actions/{id}/approve|reject`, `/backup/status`, `/chat/result/{job_id}`, `/incidents/{id}`, `/runbooks/*`, `/settings*`) → `app.routes`'tan üret.
2. `.env.example`'da olmayan 40 okunan anahtar (`HOST_EXEC_TOKEN`, `NUT_*`, `HOMELAB_GATE_MODE_FILE`, `CLAUDE_CODE_*_TIMEOUT`, `CLAUDE_CODE_SALVAGE`, `JEV_*`, `DASHBOARD_CORS_ORIGINS` …); kodda olmayan 3 (`NOTIFY_HOURLY_SUMMARY`, `NOTIFY_AUTO_RECOVERY`, `PROXMOX_TIMEOUT`); CLAUDE.md zorunlu listesi `HOST_EVENT_TOKEN` ve `WHATSAPP_WEBHOOK_SECRET`'ı saymıyor.
3. `docs/00-overview.md:47-59` şema: postgres MCP yok, yalnız "S4→WA", CT 200-206/208 (envanter 217'ye kadar).
4. `docs/02-metrics.md:373,425` "donanım tetikleyicileri bağlı değil" ↔ `thresholds.yaml:124-186` `layer3.*` kuralları var; `zfs.*`/`pbs.*` metrikleri gerçekten yok → karar.
5. `docs/decisions.md:22` "NPM .29 henüz oluşturulmadı"; `backup_expectations.yaml:33,77` "saatlik pg_dump HENUZ YOK" (ev işi, karar).
6. `index.html:232` `brandVer` seed "v0.56.0" (canlıda `/health`'ten güncelleniyor, kozmetik).

---

## homelab-agent-ha

### HA-01 · OOM düzeltmesi yalnız kutuda; repo onu bilmiyor — P1 · S
- Kanıt: `docs/known-issues.md:273-275` "uygulandı 2026-09-03, CT 209 `/etc/systemd/system/postgresql@.service.d/oom.conf`: `OOMPolicy=continue` + `Restart=on-failure`"; `systemd/` 5 dosya, `OOMPolicy` grep'i yalnız docs'ta.
- Neden: CT 209 yeniden kurulursa "tek OOM = 3 gün körlük" geri gelir.
- Adımlar: `systemd/postgresql@.service.d/oom.conf` repoya; autodeploy'a unit/drop-in senkronu (HA-02); `docs/deploy-checklist.md`'ye kurulum satırı.
- Bitti: `grep -r OOMPolicy systemd/` 1; checklist satırı.

### HA-02 · Deploy kapısı sys'in gerisinde: dry-run, geri-uyumsuz işareti, unit senkronu, self-check, audit rotasyonu yok — P1 · M
- Kanıt: `ops/homelab-agent-autodeploy.sh:117-141` yalnız `pip install` + `thresholds.validate_config`; `-- geri-uyumsuz:` grep boş (sys `migrations.py:118`); `known-issues.md:66-68` "`run_migrations` is not wrapped in try"; `homelab_agent/audit.py:24,31` `audit.jsonl` sınırsız (sys `audit.py:34,45` 64 MiB); `tests/` yok; `docs/cross-pollination-plan.md:62,95` belge v1.5.0'da.
- Adımlar ("Yön B Batch 2"): (1) sys `ops/deploy-gate.sh` deseni: tüm `_self_check` + migration dry-run restart öncesi; (2) `migrations.geri_uyumsuz` kapısı; (3) unit/drop-in senkronu; (4) `_JSONL_MAX_BYTES` bloğu; (5) plan belgesine Batch 2 satırları.
- Bitti: DROP içeren migration push'u kapıda kırmızı; `audit.jsonl` 64 MiB'de dönüyor; cross-pollination tablosunda Batch 2 ✅.

### HA-03 · LLAT/recorder yokluğu görünmez; iptal edilen token 3 gün fark edilmeyebilir — P1 · S
- Kanıt: eksik `HA_TOKEN` → checker `write_probe_failure(…, "no HA_TOKEN")` (`checkers/ha_zha.py:30`, `ha_updates.py:125`) ama `checkers/agent_self_health.py:165-169` "`ha.*` unknown rows are a normal, documented state" → kart yok; `/health` (`api.py:457-468`) ve `operasyon_durumu` (`:333-349`) bayrak taşımıyor; `threshold_matcher.py:73-74` "a revoked LLAT turned every ha.* row unknown".
- Adımlar: `/health.operasyon`'a `ha_token: configured|missing|rejected`, `recorder_db: configured|missing`; `ha.*` satırlarının tamamı unknown ise self-health kartı; katalog çekim hatasını (`ha_mcp_catalog.py:216` yalnız `log.warning`) `write_probe_failure` ile metriğe bağla.
- Bitti: token silinince 1 tick içinde kart; `/health` iki bayrak.

### HA-04 · Bağımlılık pinleri yok — P1 · S
- Kanıt: `requirements.txt:2-50` 17 aralık, `==`/lock yok; `:27-28` "autodeploy runs pip without -U".
- Adımlar: S-02 ile aynı (`requirements.lock` + `-c`).
- Bitti: lock repoda.

### HA-05 · Saklama: 4 tablo + `audit.jsonl` sınırsız — P2 · S
- Kanıt: var: `metrics` 365 g, `audit_events` 90 g, `entity_snapshots` 90 g, `ha_log_events` 30 g, `ai_consultations.prompt` NULL 180 g (satır kalıcı), `consult_outcomes`/`eval_runs` 365 g, `chat_jobs` 24 s; yok: `anomalies`, `escalations`, `actions`, `kota_olcumleri` (`migrations/0018`).
- Adımlar: hygiene'e `kota_olcumleri` > 180 g, `anomalies`/`actions`/`escalations` > 2 yıl; `audit.jsonl` rotasyonu (HA-02/4).
- Bitti: hygiene log'unda 4 tablo.

### HA-06 · Self-check 29/70 modülde yok; skill payı ölçülmüyor; kapı harness'ı yalnız canlıda — P2 · M
- Kanıt: self-check'siz en büyükler `inventory.py` 483, `clients/ha_recorder_db.py` 479, `mcp_pool.py` 441, `checkers/ha_learned.py` 370, `mcp_servers/agentdb_server.py` 327, `checkers/ha_updates.py` 270, `replay.py` 268, `entity_groups.py` 268 (+ `claude_hooks/posttooluse_log.py`, kök `homelab_agent.py`); `skill_context.py:27` `MAX_CHARS = 14000`, gövde 11 669 + sarmalayıcı → pay **2 040** (CLAUDE.md:133 "~2.3K" sarmalayıcıyı saymıyor), self-check yok; madde 145 harness'ı canlı `audit_events`'ten (`checkers/ha_mcp_surface.py:195-203`), repoda golden fixture yok.
- Adımlar: `inventory.py` + `ha_recorder_db.py` self-check; `skill_context._self_check`: `len(skill_block()) < MAX_CHARS - 500`; `audit_events`'ten türetilmiş 50–100 çağrılık JSON fixture'ı `pretooluse_safety._self_check`'e.
- Bitti: self-check'siz modül ≤ 20; fixture dosyası repoda; SKILL.md büyütülünce self-check kırmızı.

### HA-07 · Kilitli runbook'lar yedeksiz — P2 · S
- Kanıt: `.gitignore:29-31` `runbooks/*.md`; `homelab_agent/runbooks.py:12-13` "`<!-- locked -->` … nightly distill will not overwrite" (elle yazılan içerik); docs'ta yedek sözü yok (`decisions.md:1364`).
- Adımlar: kilitli runbook'ları `memory_notes(kind=preference)`'e yaz ya da günlük brain `kaynaklar/`'a kopya.
- Bitti: CT 209 silinse kilitli metin başka yerde.

### HA-08 · Isıtma modeli ve `scripts/` ignore kuralı — P2 · S
- Kanıt: `*.joblib` git-ignored (`.gitignore:45-47`), kutu kaybında `POST /predict/heating` 503 (`api.py:1470`); refit "ileride" (`decisions.md:1223`), scheduler'da iş yok; `.gitignore:24-27` `scripts/` ignore ↔ `scripts/model-ab.py` izleniyor.
- Adımlar: `ops/heating-train.sh` (`datasets/heating/train_augmented.py`) + deploy-checklist satırı; `scripts/` kuralını kaldır ya da dosyayı `ops/`a taşı.
- Bitti: temiz CT'de tek komutla model üretiliyor; `.gitignore` ile `git ls-files` çelişmiyor.

### HA-09 · Bekleyen operatör kararları ve ölçümler — P2 · S
- Kanıt: `docs/decisions.md:82` madde 141 varsayımı (Supervisor `restart` duran eklentiyi başlatır mı) "yapılmadı"; `:477` "araçlı bütün işler (ölçülmedi — harcamanın ~%90'ı; onay bekliyor)"; `:580` kapıda tanımsız `ha_set_integration`, `ha_manage_updates`, `ha_config_set_dashboard`; `:1255` 1.7.0 etkisi ölçülmedi; `docs/model-ab-sonucu.md:134,320,333` üç "ölçülmedi".
- Adımlar: üçünü (82/477/580) haftalık tahtaya; yazma-ret kipli replay ile 477 ve model-ab ölçümü tek koşuda.
- Bitti: decisions.md'de üç satırda tarihli karar; model-ab'de rakam.

### HA-10 · Consult hata oranı kartı yok — P2 · S
- Kanıt: `checkers/agent_self_health.py:23-36` yalnız `file_missing`/`no_auth`; `/jobs.last_run` (`api.py:477-479`) gösterir, kart yok.
- Adımlar: 24 saatlik consult `rc≠0` oranı > %50 → self-health satırı.
- Bitti: sahte 3 hata ile kart.

### HA-11 · systemd sertleştirme — P2 · S
- Kanıt: `systemd/homelab-agent-ha.service:55-70` `NoNewPrivileges`, `CapabilityBoundingSet`, `UMask=0077` var; `ProtectSystem/ProtectHome/PrivateTmp` yok (sidecar da).
- Adımlar: S-08 ile aynı (Y-04).

### HA-12 · Belge sapmaları — P3 · S
1. `CLAUDE.md:62-63` "yayın-hatası sayacı sys'e henüz taşınmadı" ↔ `event_log.py` 0 fark, sys `event_log.py:149` → cümleyi sil.
2. `docs/deploy-checklist.md` §4 `PG_HA_*` (CLAUDE.md:117 yok), §5 `:43-44` "presence-check only" ↔ `checkers/ha_addons.py:1` running state, §8 `:57` "homelab-agent-dashboard" reposu (yok), §11 `:73,85` "replaces Telegram / TELEGRAM_* sil" ↔ seçilebilir kanallar + WA kapalı → yeniden yaz.
3. `docs/uretim-plani.md:131` `layer0.ha_api probe: ha_rest` ↔ `config/inventory.yaml:27-28` yalnız https → LLAT'lı prob kararı.
4. `docs/decisions.md:1069,1505,1587` kapanmış ama metin eski (snooze UI, log paneli, chat_jobs).
5. README rota tablosu 21/51; `docs/capabilities.md:245` `POST /consult` ↔ gerçek `POST /anomalies/{anomaly_id}/consult`; `README.tr.md`'de `POST /predict/heating` yok.
6. `.env.example`'da olmayan 40 okunan anahtar (`HOMELAB_ADVISORY_REACTIVE` kill-switch yalnız yorumda, `HOMELAB_REACTIVE_MAX_PARALLEL`, `SELF_HEAL_*`, `CLAUDE_CODE_*_TIMEOUT`); CLAUDE.md zorunlu listesi `AGENT_API_PROXY_SECRET`'i saymıyor (`api.py:398-400` yoksa her pano mutasyonu 403).
7. `escalation.py:18` "a WhatsApp recommendation" → kanal-bağımsız.

---

## homelab-agent-sage

### SG-01 · brain-mcp ve HA MCP uçları yoklanmıyor; çökünce alarm yok — P1 · M
- Kanıt: `sage/mcp_health.py:258-262` "http/sse uçları: bu sürümde yoklanmıyor, kırık sayılmıyor … kisayol … `Durum(ad, True, hata="uzak uç yoklanmadı")`"; `sage/brain.py` bağlantı hatasında boş liste; `.claude/agents/brifing.md:4` HA araç adları sabit, `tools/list` ile kıyaslayan test yok (`tests/test_briefing.py:555-578` snapshot).
- Neden: brain düşünce K1 bağlamı sessizce boşalır, brifing uyarı vermez; HA MCP yüzey adı değişirse brifing havasız kalır (bir kez yaşandı, `test_briefing.py:567`).
- Adımlar: `initialize → notifications/initialized → tools/list` ile `brain`/`homeassistant` yoklaması; `tests/veri/ha_tools_list.json` snapshot + ad eşitliği testi; `brain.ara` boş-hata sayacı `job_runs.ozet`'e ve brifing satırı.
- Bitti: `/api/health.mcp.brain.arac > 0`; brain kapalıyken brifingde "brain erişilemez" satırı.

### SG-02 · Panel (`web/`) kapısız — P1 · S
- Kanıt: `.github/workflows/ci.yml` yalnız pytest (`:18`); web yalnız `deploy.yml:148-149` `npm ci && npx next build`; `web/package.json:8-12` lint/test yok; `error.tsx`/`not-found.tsx` yok; `npm audit` yok; `@types/node ^22` ↔ `engines >=26`.
- Adımlar: `ci.yml`'e `web` işi (`npm ci`, `tsc --noEmit`, `npm audit --omit=dev --audit-level=high`); `web/app/error.tsx` + `not-found.tsx`.
- Bitti: tip hatası içeren PR CI'da kırmızı; `/olmayan` Türkçe 404.

### SG-03 · `audit` saklama politikası kodla çelişiyor; kabul logları birikiyor — P1 · S
- Kanıt: `migrations/020_olay.sql:30` "SAKLAMA 90 gün (mevcut audit politikası)" ama `audit` için DELETE yolu yok (grep boş; `dilim-1:693` yasaklar); `deploy/kabul.sh:34-40` her deploy'da `/var/log/sage-kabul/<ts>-<sha>.log`, temizleme yok.
- Adımlar: `pg_total_relation_size('audit')` ölç; karar yaz (silinmez / N gün) ve 020 yorumunu düzelt; `kabul.sh`'a `find "$DIZIN" -name '*.log' -mtime +90 -delete`.
- Bitti: karar docs/06'da; `du -sh /var/log/sage-kabul` sabit.

### SG-04 · Skill yüklemesi kanıtsız — P2 · S
- Kanıt: `CLAUDE.md:141` "(canlıda doğrulanmadı)"; `tests/test_agents.py:88-104` yalnız özel testler, "gövdede skill adı geçiyorsa `tools:`'ta `Skill` var" generic iddiası yok.
- Adımlar: `test_skill_atifi_olan_rolun_tools_unda_Skill_var`; CT 215'te bir `saglik-trend` koşusunun stream-json'ında `Skill` tool_use satırını say.
- Bitti: test var; CLAUDE.md:141 parantezi tarihli ölçümle değişti.

### SG-05 · Kapı ve egress testlerinin sertliği — P2 · S
- Kanıt: `sage/gate.py:479` "DENY → APPROVE → ALLOW", `:530-533` AK-26 muafiyeti; adı hem DENY hem APPROVE parçası taşıyan araç için (`delete_forever`) sıra testi yok; `tests/test_ilac.py:287` `endswith("canliArama.php?sorgu=…")` — host ve "başka param yok" eşitlikle sabit değil, `urller[1:]` asert edilmiyor; `sage/telegram_bot.py:300-310` `butonlari_kaldir`/`metni_guncelle` `"text": metin` doğrudan (`duz_metin` kapısı dışında); "Telegram kapalı + e-posta açık → tek e-posta" senaryosu testsiz (`poller.py:108-117`, `jobs.py:247`).
- Adımlar: 4 test (gate parametrik DENY; ilac tam URL + `all(u.startswith(KAYNAK))`; iki Telegram metodunda `duz_metin` uygula/asert; kanal düşme senaryosu).
- Bitti: 4 test yeşil.

### SG-06 · Sabit IP listesi ve `os.environ` aykırılıkları — P2 · S
- Kanıt: `sage/api.py:31-32` `API_ISTEMCILERI = frozenset({NPM_IP, "192.168.1.38", ".30", ".36", "127.0.0.1"})`; `sage/settings.py:3` "diğer modüller `os.environ`'a bakmaz" ↔ `llm_kosu.py:28`, `briefing.py:254`, `ajan_soket.py:27`.
- Adımlar: `SAGE_API_ISTEMCILERI` env (virgüllü, varsayılan bugünkü küme) ya da CLAUDE.md'ye "bilinçli sabit"; üç okumayı `Ayarlar`'a taşı.
- Bitti: `grep -c 'os.environ' sage/*.py | grep -v settings` yalnız parametre varsayılanları.

### SG-07 · Migration geri alma konvansiyonu yazılı değil — P2 · S
- Kanıt: 53 forward-only migration; "Geri alma" yorumu 24'ünde var, 29'unda yok (`053_olay_bakim_basladi.sql:16-17` iyi örnek).
- Adımlar: README'ye "forward-only; her dosyada `-- Geri alma:` bloğu"; `test_migrations`'a yeni dosyalar için yorum varlığı testi.
- Bitti: 054+ dosyalar testle zorunlu.

### SG-08 · Canlı doğrulama borçları (beş satır) — P2 · S
- Kanıt: `docs/kodlama/dilim-7-ses.md:275` Safari/iOS `audio/mp4` yolu doğrulanmadı; `docs/05-canli-dogrulama.md:117-128` PWA telefonda kurulum "kullanıcıdan bekleniyor"; `docs/10-ajan-izolasyonu.md:287` sağlık kuyruk yollarının `sage-ajan` uid'inde koştuğu ölçülmedi; `docs/07-mcp-ucu.md:238-246` connector yolu ölçülmedi, broker zaman aşımı bilinmiyor, anahtar rotasyonu penceresi yok; `docs/13:99-100` çıkarım doğrulanmadı.
- Adımlar: her biri tek ölçüm (iPhone Safari `POST /api/stt`; "Ana ekrana ekle"; `ilac-notu` koşusunu `sage-ajan@*` birimiyle eşle; connector için "açılmayacak" kararı ya da tek `tools/list`; health'te değerlendirme sil→yeniden iste).
- Bitti: beş satırda tarih + sonuç.

### SG-09 · `httpx` yalnız geçişli bağımlılık — P2 · S
- Kanıt: `requirements.txt`'te yok; `tests/test_api.py:103` `import httpx` (PTB 22.6 çekiyor).
- Adımlar: AK-4 listesine açık pin ya da "PTB geçişli, test taşıyıcısı" yorumu.
- Bitti: `requirements.txt`'te satır/yorum.

### SG-10 · Sage DB RPO yazılı değil — P2 · S
- Kanıt: `docs/01-mimari-karari.md:1047-1048` yalnız "CT 215 gecelik vzdump/PBS"; DB CT 200'de; sys `backup_expectations.yaml:23-33` "saatlik pg_dump HENUZ YOK → ~24h".
- Adımlar: docs/01 güvenlik modeline RPO satırı (`approvals`/`chat_turns` için 24 s kabulü).
- Bitti: satır var (Y-06).

### SG-11 · Belge sapmaları — P3 · M
1. Dilim planlarında 263 işaretsiz kutunun ~255'i kabul-komutu kutusu (`dilim-6:603` "Durum: tamam" ↔ `:613` kutu boş) → dosya başına "kutular kabul komutudur, durum `Durum:` satırında" notu ya da tek seferde `[x]`; bitti: `grep -c '^\s*- \[ \]' docs/kodlama/*.md` → yalnız SG-08'dekiler.
2. `dilim-3:634,978` olmayan test dosyaları (`test_skills.py`, `test_isler.py`); `00-genel-plan.md:290` AK-12 "karar bekliyor" (`01:133` verildi), `:1913` `job_runs` retention "ölçülmedi" (`settings.py:122` 90 g var); `README.md:312-316` "iki insan adımı bekliyor" (`LESSONS.md:83-87` kapandı); `docs/09:238-242` üç "eklenmeli" kapandı.
3. README uç listesi yok: 19 router / 56 rota, 11 prefix hiç anılmıyor (`/api/bugun`, `/api/listeler`, `/api/tahlil-tekrar`, `/api/sessions`, `/api/jobs`, `/api/approvals`, `/api/ayarlar`, `/api/llm/kosular`, `/api/chat`, `/api/upload`, `/api/yuklemeler`) → prefix→router tablosu ya da "`/openapi.json` kanonik".
4. `.env.example`'a `SAGE_AGENT_ROLE`, `SAGE_AJAN_CLAUDE` "dahili, elle set etme" notu.
5. Brain `projeler/homelab-agent-sage.md` `yasam_dongusu: taslak` (419 satır, kararlı içerik) → `kararli`.

---

## Ortak (sekiz repo)

Çakışmalar: **Y-04 ↔ B-04** (systemd sertleştirme, brain dahil üç servis) · **Y-06 ↔ X-06** (yedek/restore belgesi; birlikte tek şablon) · **M-07 ↔ X-03/X-05** (next-auth pini, renovate) · **Y-07 ↔ X-02** değil, ayrı (Y-07 belge/env envanteri, X-02 CHANGELOG kapısı).

### İlk dört repodan (X)

#### X-01 · e2e/a11y kapısı yalnız library'de — P2
- F-06 ve H-04'ü aynı test-kimliği yaklaşımıyla yap; library `ci.yml:91-131` şablon.
- Bitti: üç Next uygulamasında CI `e2e` job'ı.

#### X-02 · CHANGELOG kapısı yalnız library'de — P2 · S
- Kanıt: library `ci.yml:157-164` `changelog` job'ı; finance/health `ci.yml`'de yok (ikisi de CHANGELOG tutuyor).
- Adımlar: job'ı kopyala (`[skip changelog]` istisnası dahil).
- Bitti: finance ve health CI'da `changelog` job'ı; CHANGELOG'suz push kırmızı.

#### X-03 · `next-auth` üç repoda `^5.0.0-beta.32` — P2 · S
- Adımlar: `^` yerine tam pin; stable 5.x çıkınca tek PR; `auth.config.ts` claim testleri önce.
- Bitti: üç `package.json`'da aynı tam sürüm.

#### X-04 · `overrides` her `next` yükseltmesinde gözden geçirilmiyor (ADR-0004 / ADR 0005) — P2 · S
- Kanıt: finance F-12, health H-17, library `package.json` `sharp ^0.35.3` (aynı durum).
- Adımlar: üçünde `sharp` override'ını sil; CHANGELOG'a "override gözden geçirildi" satırı; ADR'lere "next bump = override kontrolü" checklist satırı.
- Bitti: üç repoda `npm audit --omit=dev` 0 ve override listesi gerekçeli.

#### X-05 · Bağımlılık botu yok; sürümler ayrışıyor — P2 · S
- Kanıt: dört repoda `.github/` altında dependabot/renovate yok; kysely 0.28/0.29, kysely-codegen 0.18/0.20, `@types/node` 22/26.
- Adımlar: ortak `renovate.json` (haftalık, grup: next/react/kysely/zod); library sürümlerini eşitle; brain için `uv lock` (B-06).
- Bitti: dört repoda ilk bot PR'ı açılmış; L-16 ölçütü.

#### X-06 · Yazılı restore prosedürü hiçbir repoda yok — P2 · S
- F-14, L-02, H-16 tek şablondan (PBS restore + `shared/.env` + break-glass + prova tarihi).
- Bitti: üç runbook + üç prova tarihi.

### Ajan repolarından (Y)

#### Y-01 · "Birebir aynı" dosyaların eşitliğini kilitleyen test yok — P2 · S
- Kanıt: beş dosya şu an 0 fark; tek parite testi `homelab-agent-sys/tests/test_read_allow.py` (proxmox-mcp ile); sidecar/s6_gate/event_log/brain_context/kota için yok; ha CLAUDE.md'deki bayat "taşınmadı" notu bu yüzden fark edilmedi.
- Adımlar: sys/ha/sage'de `tests/test_parite.py` (ha'da `_self_check`): kardeş klon varsa sha256 eşitliği (`skipUnless`), yoksa repo içi `PARITE_SHA.txt` ile karşılaştırma; `/sidecar-esitle` skill'ini 5 dosyaya genişlet.
- Bitti: bir dosyada tek satır değişince kardeş repoda test kırmızı.

#### Y-02 · sys ve ha bağımlılık kilidi — P2 · S
- S-02, HA-04: `requirements.lock` + autodeploy `-c`; sage pinli, memory `package-lock` var.
- Bitti: iki repoda lock.

#### Y-03 · DB saklama politikası — P2 · S
- S-03, HA-05, SG-03: her repoda docs'a tablo başına retention tablosu; ortak hygiene deseni.
- Bitti: üç repoda tablo ve purge işi.

#### Y-04 · systemd sertleştirme — P2 · M
- S-08, HA-11 (+ ilk listedeki brain B-04): `ProtectSystem=strict` + `ReadWritePaths`; `claude -p` `~/.claude` yazımı ölçülerek.
- Bitti: `systemd-analyze security` üç serviste "MEDIUM" altı.

#### Y-05 · Alarm boşlukları: her ajanın `/health`'ine bağımlılık bayrağı — P2 · S
- M-01 (kaynaklar), S-05 (kota/kuyruk), HA-03 (LLAT/recorder/katalog), SG-01 (brain/HA MCP): dört `/health` ucuna `bagimliliklar: {ad: ok|down|missing}` bloğu; CT 207 `layer0.*` probları bu bloğu okusun.
- Bitti: dört uçta blok; sys thresholds'ta dört kural.

#### Y-06 · Yedek/RPO belgesi — P2 · S
- S-11, SG-10, HA-07; memory "bilinçli yedeksiz" ✓. Her repoda README'ye "Yedek/RPO" satırı (ne, nerede, kaç saat).
- Bitti: dört README'de satır.

#### Y-07 · Belge bayatlığı ve env envanteri — P3 · S
- M-08, S-12, HA-12, SG-11 tek oturum; ek olarak her repoda `ops/env-envanter.sh` (kodda okunan ↔ `.env.example`) ve CI/self-check uyarısı (memory 1, sys 40, ha 40, sage 2 eksik anahtar).
- Bitti: dört repoda envanter farkı 0 ya da "dahili" olarak etiketli.

---

## Zaten kapanmış, yeniden yapılmayacak (yanıltıcı "açık" kayıtlar)

**brain · finance · library · health**
- Sage/sage_ro DB parola rotasyonu — 2026-10-08 (brain notunun kendi 45. satırı; Fable 100/194).
- Tahlil PDF eklerinin `dosya` tablosuna geri yüklenmesi — health 0.3.1 (`scripts/db/import-ekler.sql`).
- `saglik` DB emekliliği — 2026-07-18 (brain); yalnız health belgesi eksik (H-19/5).
- Apple Watch tam export'unun otomatik içe aktarımı — health 0.26.0, ADR 0011; brain notları bayat (B-12/4). Gerçek kalan: export'u Drive'a bırakma adımı elle.
- Fable triyajı 147–168 (finance RLS kapısı, transfer çifti, çıpa, zarf devri, audit ekranı, tekrarlayanlar, TCMB kuru; health RLS kapısı, takma ad, vital trend, karşılaştırma, audit ekranı, KVKK export/silme, tekrar hatırlatıcısı) — Ekim ortasında canlıda.
- Library `.gitmodules` URL'i — 1.17.13.
- Finance Faz 3 — kullanıcı kararıyla kapalı; buradaki hiçbir madde onu yeniden açmıyor.

**memory · sys · ha · sage**
- Fable 2026-10 tahtası: sys 90, 97, 128, 132–137; ha 138–146, 198 (189 kısmi, bilinçli sınır); sage 110–123, 195, 325; memory 169–174 (172 kısmen → M-04).
- memory `docs/GOREVLER.md` 41/41 ✅, G4 canlı; sage docs/08 Faz 1–4, docs/09 §6 13/13, docs/10 adım 1–4, dilim 7 T7.1–T7.11; ha üretim planı Faz 0–7 (1.0.0).
- Memory CT 210 allow-list (nft 2026-10-16 canlı) ve `session.maxAge` ("kalsın", 2026-10-09) → yalnız belge düzeltmesi (M-08/5-6).
- ha `event_log.py` yayın-hatası sayacı sys'te var → yalnız CLAUDE.md düzeltmesi (HA-12/1).

## Önerilen sıra (ilk iki hafta, her adım ≤ yarım gün)

1. **Küçük P1'ler, sekiz repo:** F-01, F-02, H-02, H-03, HA-01, S-01, SG-03 (audit'siz yazma, sızıntı, PDF MIME, CI build, OOM drop-in, `/token/upload` + sidecar SECRET, kabul log temizliği).
2. **Brain:** B-01, B-02, B-03 (ingest venv/rc, sır kapısı, health probu).
3. **Bağımlılık kilidi:** Y-02 (sys/ha `requirements.lock`), X-04 (üç Next uygulamasında `overrides` temizliği), X-02 (finance/health CHANGELOG kapısı).
4. **Library:** L-01, L-03 (health ucu, `password_hash`/argon2 temizliği).
5. **Parite ve alarm:** Y-01 (üç repoda parite testi), Y-05 (dört ajan `/health`'ine bağımlılık bayrağı: M-01, S-05, HA-03, SG-01).
6. **Deploy:** H-05, F-07 (sıra hizası, otomatik rollback provası); HA-02 (ha deploy kapısı portu, M).
7. **Belge turu, tek oturum:** B-12/1-6, Y-07 (ha CLAUDE.md, memory README/CLAUDE.md, sys/ha `.env.example`, bayat "açık iş" satırları).

Sonraki dalga: F-04, H-01, L-04, B-04/Y-04 (M); saklama politikaları Y-03 (S-03, HA-05, SG-03); SG-02 panel kapısı; M-03 brain-mcp dönüş alanları; e2e X-01 (F-06, H-04, M-05); runbook'lar X-06/Y-06; S-07 tasarım borçları kararı.
