# İş listesi — homelab-brain · homelab-finance · homelab-library · homelab-health

Tarih: 2026-11-01 · Kapsam: dört reponun `main` ucu (brain `6dbccaa`, finance 0.58.2 `9017308`, library 1.19.12 `ddc5646`, health 0.37.3 `2279b1d`).

## Nasıl okunur

- Her madde: **kanıt** (`dosya:satır`), **neden**, **adımlar**, **bitti ölçütü**. Ölçüt sayılabilir ya da bir komutla doğrulanabilir olacak şekilde yazıldı.
- Öncelik: **P1** risk/doğruluk/güvenlik · **P2** kalite/operasyon · **P3** belge hijyeni. Büyüklük: **S** < yarım gün · **M** 1–2 gün · **L** daha fazla (tahmin, ölçüm değil).
- Yöntem: proje tanımları, ADR'ler, CHANGELOG'lar, CI/deploy dosyaları ve brain'deki görev tahtaları (Fable 2026-10 takip listesi dahil) okundu; dört repoda paralel kod denetimi yapıldı; her kritik bulgu kaynak dosyada yeniden doğrulandı. Repo dışı canlı durum (CT'lerdeki `.env`, bind adresi, coverage yüzdesi) doğrulanamadı ve öyle işaretlendi.
- Bilinçli kapsam dışı: finance Faz 3 (çok kullanıcı, open banking, uygulama-seviyesi yedek, bildirim) 2026-09-04'te kapatıldı; önerilmedi. Kabul edilmiş artık riskler (2FA, at-rest şifreleme, Telegram bildirimi, `sage_ro` defacl) iş olarak yazılmadı.

## Özet tablo

| Repo | P1 | P2 | P3 | En acil üç |
|---|---|---|---|---|
| brain | 4 | 7 | 2 | B-01 ingest venv/rc · B-02 sır kapısı · B-03 health probu |
| finance | 6 | 8 | 4 | F-01 audit'siz yazma · F-02 `/api/health` sızıntısı · F-04 taksit dedup |
| library | 5 | 9 | 2 | L-01 health ucu yok · L-02 storage yedeği · L-03 `password_hash`/argon2 |
| health | 7 | 10 | 2 | H-01 zip bellek/bomba · H-02 PDF sihirli bayt · H-03 CI'da build yok |
| ortak | — | 6 | — | X-01 e2e/a11y · X-02 CHANGELOG kapısı · X-04 `overrides` gözden geçirme |

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

## Ortak (dört repo)

### X-01 · e2e/a11y kapısı yalnız library'de — P2
- F-06 ve H-04'ü aynı test-kimliği yaklaşımıyla yap; library `ci.yml:91-131` şablon.
- Bitti: üç Next uygulamasında CI `e2e` job'ı.

### X-02 · CHANGELOG kapısı yalnız library'de — P2 · S
- Kanıt: library `ci.yml:157-164` `changelog` job'ı; finance/health `ci.yml`'de yok (ikisi de CHANGELOG tutuyor).
- Adımlar: job'ı kopyala (`[skip changelog]` istisnası dahil).
- Bitti: finance ve health CI'da `changelog` job'ı; CHANGELOG'suz push kırmızı.

### X-03 · `next-auth` üç repoda `^5.0.0-beta.32` — P2 · S
- Adımlar: `^` yerine tam pin; stable 5.x çıkınca tek PR; `auth.config.ts` claim testleri önce.
- Bitti: üç `package.json`'da aynı tam sürüm.

### X-04 · `overrides` her `next` yükseltmesinde gözden geçirilmiyor (ADR-0004 / ADR 0005) — P2 · S
- Kanıt: finance F-12, health H-17, library `package.json` `sharp ^0.35.3` (aynı durum).
- Adımlar: üçünde `sharp` override'ını sil; CHANGELOG'a "override gözden geçirildi" satırı; ADR'lere "next bump = override kontrolü" checklist satırı.
- Bitti: üç repoda `npm audit --omit=dev` 0 ve override listesi gerekçeli.

### X-05 · Bağımlılık botu yok; sürümler ayrışıyor — P2 · S
- Kanıt: dört repoda `.github/` altında dependabot/renovate yok; kysely 0.28/0.29, kysely-codegen 0.18/0.20, `@types/node` 22/26.
- Adımlar: ortak `renovate.json` (haftalık, grup: next/react/kysely/zod); library sürümlerini eşitle; brain için `uv lock` (B-06).
- Bitti: dört repoda ilk bot PR'ı açılmış; L-16 ölçütü.

### X-06 · Yazılı restore prosedürü hiçbir repoda yok — P2 · S
- F-14, L-02, H-16 tek şablondan (PBS restore + `shared/.env` + break-glass + prova tarihi).
- Bitti: üç runbook + üç prova tarihi.

---

## Zaten kapanmış, yeniden yapılmayacak (yanıltıcı "açık" kayıtlar)

- Sage/sage_ro DB parola rotasyonu — 2026-10-08 (brain notunun kendi 45. satırı; Fable 100/194).
- Tahlil PDF eklerinin `dosya` tablosuna geri yüklenmesi — health 0.3.1 (`scripts/db/import-ekler.sql`).
- `saglik` DB emekliliği — 2026-07-18 (brain); yalnız health belgesi eksik (H-19/5).
- Apple Watch tam export'unun otomatik içe aktarımı — health 0.26.0, ADR 0011; brain notları bayat (B-12/4). Gerçek kalan: export'u Drive'a bırakma adımı elle.
- Fable triyajı 147–168 (finance RLS kapısı, transfer çifti, çıpa, zarf devri, audit ekranı, tekrarlayanlar, TCMB kuru; health RLS kapısı, takma ad, vital trend, karşılaştırma, audit ekranı, KVKK export/silme, tekrar hatırlatıcısı) — Ekim ortasında canlıda.
- Library `.gitmodules` URL'i — 1.17.13.
- Finance Faz 3 — kullanıcı kararıyla kapalı; buradaki hiçbir madde onu yeniden açmıyor.

## Önerilen sıra (ilk iki hafta, her biri ≤ yarım gün)

1. F-01, F-02, H-02, H-03 — dört küçük P1 (audit, sızıntı, MIME, CI build).
2. B-01, B-02, B-03 — brain ingest venv/rc, sır kapısı, health probu.
3. L-01, L-03 — library health ucu ve `password_hash`/argon2 temizliği.
4. X-02, X-04 — CHANGELOG kapısı ve override temizliği (üç repo, tek öğleden sonra).
5. H-05, F-07 — deploy sırası hizası ve otomatik rollback provası.
6. B-12/1-6 — brain tahta arşivi ve bayat "açık iş" satırları (bir oturum).

Sonraki dalga: F-04, H-01, L-04, B-04 (M); ardından e2e (X-01) ve runbook'lar (X-06).
