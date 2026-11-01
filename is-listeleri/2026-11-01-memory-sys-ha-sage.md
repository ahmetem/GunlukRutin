# İş listesi — homelab-memory · homelab-agent-sys · homelab-agent-ha · homelab-agent-sage

Tarih: 2026-11-01 · Kapsam: dört reponun `main` ucu (memory 0.17.5 `6ffd5c6`, sys 0.125.0 `0291bbc`, ha 1.76.0 `654d843`, sage 0.91.0 `4686e8d`). İlk liste (brain/finance/library/health) ayrı dosyada; biçim ve öncelik tanımı aynı.

## Nasıl okunur

- Her madde: **kanıt** (`dosya:satır`), **neden**, **adımlar**, **bitti ölçütü**. P1 risk/doğruluk/güvenlik · P2 kalite/operasyon · P3 belge. Büyüklük S/M/L tahmin.
- Yöntem: CLAUDE.md'ler, docs/, CHANGELOG'lar, brain proje notları ve Fable 2026-10 takip tahtası okundu; dört repoda paralel kod denetimi yapıldı; kritik bulgular kaynakta yeniden doğrulandı. Canlı CT durumu (nftables, venv, cron) doğrulanamadı ve öyle işaretlendi.
- Bilinçli kapsam dışı: kabul edilmiş riskler (sys `/health` GET'lerin açık olması, ha `POST /predict/heating` kimliksiz, memory two_factor yok, sage kabul kırmızısında geri alma yok, kota eşiği "tek ses" kararı).

## Özet tablo

| Repo | P1 | P2 | P3 | En acil üç |
|---|---|---|---|---|
| memory | 3 | 4 | 1 | M-01 kaynak izleme · M-02 örnekleyici hatası · M-03 onay sınırları |
| sys | 4 | 7 | 1 | S-01 `/token/upload` · S-02 pin/lock · S-03 DB saklama |
| ha | 4 | 7 | 1 | HA-01 OOM drop-in · HA-02 deploy kapısı · HA-03 LLAT bayrağı |
| sage | 3 | 7 | 1 | SG-01 brain-mcp alarmı · SG-02 panel kapısı · SG-03 `audit` saklama |
| ortak | — | 7 | — | Y-01 parite testi · Y-02 lock · Y-05 alarm bayrakları |

Ortak ölçümler: "birebir aynı" ilan edilen beş dosya (`whatsapp-sidecar/index.js`, `s6_gate.py`, `event_log.py`, `brain_context.py`, `kota.py`) sys ↔ ha ↔ sage arasında 0 satır fark; `notify_format.approval_card()` gövdesi eşit. Test: memory 19 dosya / ~138 `test(`; sys 47 dosya / 348 `def test_`; ha test paketi yok, 70 modülün 41'inde `_self_check`; sage 76 dosya / 1 902 `def test_`.

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

## Ortak (dört repo)

### Y-01 · "Birebir aynı" dosyaların eşitliğini kilitleyen test yok — P2 · S
- Kanıt: beş dosya şu an 0 fark; tek parite testi `homelab-agent-sys/tests/test_read_allow.py` (proxmox-mcp ile); sidecar/s6_gate/event_log/brain_context/kota için yok; ha CLAUDE.md'deki bayat "taşınmadı" notu bu yüzden fark edilmedi.
- Adımlar: sys/ha/sage'de `tests/test_parite.py` (ha'da `_self_check`): kardeş klon varsa sha256 eşitliği (`skipUnless`), yoksa repo içi `PARITE_SHA.txt` ile karşılaştırma; `/sidecar-esitle` skill'ini 5 dosyaya genişlet.
- Bitti: bir dosyada tek satır değişince kardeş repoda test kırmızı.

### Y-02 · sys ve ha bağımlılık kilidi — P2 · S
- S-02, HA-04: `requirements.lock` + autodeploy `-c`; sage pinli, memory `package-lock` var.
- Bitti: iki repoda lock.

### Y-03 · DB saklama politikası — P2 · S
- S-03, HA-05, SG-03: her repoda docs'a tablo başına retention tablosu; ortak hygiene deseni.
- Bitti: üç repoda tablo ve purge işi.

### Y-04 · systemd sertleştirme — P2 · M
- S-08, HA-11 (+ ilk listedeki brain B-04): `ProtectSystem=strict` + `ReadWritePaths`; `claude -p` `~/.claude` yazımı ölçülerek.
- Bitti: `systemd-analyze security` üç serviste "MEDIUM" altı.

### Y-05 · Alarm boşlukları: her ajanın `/health`'ine bağımlılık bayrağı — P2 · S
- M-01 (kaynaklar), S-05 (kota/kuyruk), HA-03 (LLAT/recorder/katalog), SG-01 (brain/HA MCP): dört `/health` ucuna `bagimliliklar: {ad: ok|down|missing}` bloğu; CT 207 `layer0.*` probları bu bloğu okusun.
- Bitti: dört uçta blok; sys thresholds'ta dört kural.

### Y-06 · Yedek/RPO belgesi — P2 · S
- S-11, SG-10, HA-07; memory "bilinçli yedeksiz" ✓. Her repoda README'ye "Yedek/RPO" satırı (ne, nerede, kaç saat).
- Bitti: dört README'de satır.

### Y-07 · Belge bayatlığı ve env envanteri — P3 · S
- M-08, S-12, HA-12, SG-11 tek oturum; ek olarak her repoda `ops/env-envanter.sh` (kodda okunan ↔ `.env.example`) ve CI/self-check uyarısı (memory 1, sys 40, ha 40, sage 2 eksik anahtar).
- Bitti: dört repoda envanter farkı 0 ya da "dahili" olarak etiketli.

---

## Zaten kapanmış, yeniden yapılmayacak

- Fable 2026-10 tahtası: sys 90, 97, 128, 132–137; ha 138–146, 198 (189 kısmi, bilinçli sınır); sage 110–123, 195, 325; memory 169–174 (172 kısmen → M-04).
- memory `docs/GOREVLER.md` 41/41 ✅, G4 canlı; sage docs/08 Faz 1–4, docs/09 §6 13/13, docs/10 adım 1–4, dilim 7 T7.1–T7.11; ha üretim planı Faz 0–7 (1.0.0).
- Memory CT 210 allow-list (nft 2026-10-16 canlı) ve `session.maxAge` ("kalsın", 2026-10-09) → yalnız belge düzeltmesi (M-08/5-6).
- ha `event_log.py` yayın-hatası sayacı sys'te var → yalnız CLAUDE.md düzeltmesi (HA-12/1).

## Önerilen sıra (ilk iki hafta)

1. HA-01, S-01, SG-03 — küçük P1'ler (OOM drop-in, `/token/upload` + sidecar SECRET, kabul log temizliği).
2. Y-02 — sys/ha `requirements.lock` (bir öğleden sonra).
3. Y-01 — parite testi üç repoda.
4. Y-05 — dört `/health`'e bağımlılık bayrağı (M-01, S-05, HA-03, SG-01'in ilk yarısı).
5. HA-02 — deploy kapısı portu (M).
6. Y-07 — belge turu (ha CLAUDE.md, memory README/CLAUDE.md, sys/ha `.env.example`).

Sonraki dalga: S-03/HA-05/SG-03 saklama (Y-03), SG-02 panel kapısı, M-03 brain-mcp dönüş alanları, S-07 tasarım borçları kararı.
