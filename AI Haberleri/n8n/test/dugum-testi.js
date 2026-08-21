// ai-bulteni-mail-gonder-v2.json icindeki Code dugumlerini n8n olmadan calistirir.
//
//   node "AI Haberleri/n8n/test/dugum-testi.js"
//
// Workflow JSON'undaki jsCode'lari dogrudan okur (kopya degil), GitHub Contents
// API yanitini Bultenler/ klasorunden uretir ve Gmail yanitlarini taklit eder.
// Workflow'u elle duzenledikten sonra bunu calistir.
//
// Zaman bagimli davranis (TAZE_SAAT penceresi) sahte dosya adlariyla test
// edilir: adlar "simdi"ye gore uretilir, boylece test yillar sonra da ayni
// sonucu verir. Gercek bulten dosyalari yalnizca Markdown -> HTML testinde
// kullanilir.

const fs = require('fs');
const path = require('path');

const KOK = path.resolve(__dirname, '..', '..');            // "AI Haberleri"
const BULTENLER = path.join(KOK, 'Bultenler');
const WF = path.join(KOK, 'n8n', 'ai-bulteni-mail-gonder-v2.json');

const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));
const kod = {};
for (const n of wf.nodes) {
  if (n.type === 'n8n-nodes-base.code') kod[n.name] = n.parameters.jsCode;
}

// Workflow'daki sabitleri koddan oku - test ile kod ayrisirsa hemen belli olsun.
const sabit = (ad) => {
  const m = new RegExp('const ' + ad + ' = ([^;]+);').exec(kod['Gonderilmeyenleri bul']);
  if (!m) throw new Error(ad + ' sabiti bulunamadi - dugum kodu degismis');
  return JSON.parse(m[1].trim().replace(/'/g, '"'));
};
const TAZE_SAAT = sabit('TAZE_SAAT');
const TUR_BASINA_LIMIT = sabit('TUR_BASINA_LIMIT');
const ESIK = sabit('ESIK');

// --- GitHub Contents API yaniti (gercek semayla birebir) --------------------
const SHA = 'test';
const API = 'https://api.github.com/repos/ahmetem/GunlukRutin/contents/AI%20Haberleri/Bultenler/';
const RAW = 'https://raw.githubusercontent.com/ahmetem/GunlukRutin/' + SHA + '/AI%20Haberleri/Bultenler/';
const listeUret = (ekstra = []) =>
  fs.readdirSync(BULTENLER).sort().map((name) => ({
    name, type: 'file',
    url: API + encodeURIComponent(name) + '?ref=' + SHA,
    download_url: RAW + encodeURIComponent(name),
  })).concat(ekstra);
const sahteBulten = (ad) => ({ name: ad, type: 'file', url: API + ad, download_url: RAW + ad });

// "simdi"den N saat once tarihli bulten adi (dosya adlari Europe/Istanbul = UTC+3)
const adUret = (saatOnce) => {
  const t = new Date(Date.now() - saatOnce * 3600000 + 3 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()) +
    '-' + p(t.getUTCHours()) + p(t.getUTCMinutes()) + '.md';
};

// --- mini n8n calistiricisi -------------------------------------------------
let store = {};
const sd = () => store;
const wrap = (arr) => ({ first: () => arr[0], all: () => arr });
const run = (ad, ctx) =>
  new Function('$getWorkflowStaticData', '$input', '$', '$json', 'Buffer', kod[ad])(
    sd, ctx.input, ctx.node, ctx.json, Buffer);
const liste = (govde, statusCode = 200) =>
  run('Gonderilmeyenleri bul', { input: wrap([{ json: { statusCode, body: govde } }]) });

let hata = 0;
const ok = (kosul, mesaj) => { console.log((kosul ? '  ✓ ' : '  ✗ ') + mesaj); if (!kosul) hata++; };
const bulten = (f) => /^\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(f);
const adlar = (o) => o.map((x) => x.json.dosya);

// ===========================================================================
console.log('\n[1] Ilk calisma (gercek arsiv): tohumlama + EN YENI bulten ilk turda');
store = {};
const L = listeUret();
const arsiv = L.filter((f) => bulten(f.name)).map((f) => f.name);
const enYeni = arsiv[arsiv.length - 1];
let out = liste(JSON.stringify(L));
ok(out.every((o) => o.json.gonderilecek === true), 'tum itemlar gonderilecek=true');
ok(out[0].json.dosya === enYeni,
  'ilk mail = klasordeki en yeni bulten (' + out[0].json.dosya + ')  <-- 21 Agustos arizasi burasiydi');
ok(adlar(out).every((a, i, d) => i === 0 || d[i - 1] > a),
  'secilenler en yeniden eskiye sirali: ' + JSON.stringify(adlar(out)));
ok(store.gonderilenler.length + out.length === arsiv.length,
  'her bulten ya isaretli ya secili: ' + store.gonderilenler.length + ' + ' + out.length + ' = ' + arsiv.length);
ok(!store.gonderilenler.some((n) => !bulten(n)), 'README.md / latest.json listeye girmedi');
ok(!store.gonderilenler.some((n) => adlar(out).includes(n)),
  'postalanacak dosyalar "gonderildi" olarak isaretlenmedi');
ok(!arsiv.some((n) => n < ESIK && !store.gonderilenler.includes(n)),
  'ESIK (' + ESIK + ') oncesi arsiv postalanmiyor');
ok(out[0].json.url.startsWith('https://api.github.com/'), 'indirme URL i Contents API (raw CDN onbellegine takilmaz)');

console.log('\n[2] Mail govdesi: en yeni 3 gercek bultenin metniyle');
const sonUc = arsiv.slice(-3).reverse();
const hazir = [];
for (const dosya of sonUc) {
  const md = fs.readFileSync(path.join(BULTENLER, dosya), 'utf8');
  const r = run('Mail govdesini hazirla', {
    json: { markdown: md }, input: wrap([{ json: { markdown: md } }]),
    node: (n) => {
      if (n === 'Gonderilmeyenleri bul') return { item: { json: { dosya } } };
      throw new Error('beklenmeyen dugum: ' + n);
    },
  });
  hazir.push({ json: r.json });
  const h1 = md.split(/\r?\n/).find((l) => l.trim().startsWith('# ')).trim().slice(2).trim();
  ok(r.json.konu === h1, dosya + ' -> konu = bultenin H1 i');
  const mime = Buffer.from(r.json.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  ok(/^To: posta@ahmetkaraca\.com$/m.test(mime), '  To basligi dogru');
  ok(/^Subject: =\?UTF-8\?B\?/m.test(mime), '  Subject RFC2047 base64 (Turkce + emoji)');
  const html = Buffer.from(mime.split('\r\n\r\n')[1], 'base64').toString('utf8');
  ok(html.startsWith('<!doctype html>') && html.includes('</html>'), '  govde gecerli HTML');
  ok(html.includes('<h2') && html.includes('<li'), '  bolum basliklari + maddeler cevrildi');
  ok(!html.includes(h1), '  H1 govdede tekrar etmiyor (konuda var)');
  ok((html.match(/<a href="https?:\/\//g) || []).length >= 4, '  kaynak linkleri <a> ye cevrildi');
}

console.log('\n[3] Isaretleme: 1. mail basarili, 2. mail hata verdi');
store = { gonderilenler: [] };
const isaret = run('Gonderildi olarak isaretle', {
  input: wrap([
    { json: { id: '19abc', threadId: '19abc', labelIds: ['SENT'] } },
    { json: { error: { code: 429, message: 'Rate limit exceeded' } } },
    { json: { id: '19abd', threadId: '19abd', labelIds: ['SENT'] } },
  ].slice(0, hazir.length)),
  node: (n) => {
    if (n === 'Mail govdesini hazirla') return { all: () => hazir };
    throw new Error('beklenmeyen dugum: ' + n);
  },
});
ok(isaret[0].json.gonderildi.includes(hazir[0].json.dosya), 'Gmail in id dondurdugu dosya isaretlendi');
ok(!isaret[0].json.gonderildi.includes(hazir[1].json.dosya), 'hata veren dosya isaretlenMEdi');
ok(isaret[0].json.basarisiz.length === 1 && isaret[0].json.basarisiz[0].dosya === hazir[1].json.dosya,
  'basarisiz dosya hata metniyle raporlandi: ' + isaret[0].json.basarisiz[0].hata);

console.log('\n[4] Sonraki tur: basarisiz olan tekrar denenir, basarili olan gitmez');
const taze = { yeni: adUret(1), orta: adUret(2), eski: adUret(3) };
const tazeListe = [taze.eski, taze.orta, taze.yeni].map(sahteBulten);
store = { gonderilenler: [taze.yeni] };            // en yenisi gitti, ortasi patladi
out = liste(JSON.stringify(tazeListe));
ok(adlar(out).includes(taze.orta), 'basarisiz olan yeniden secildi');
ok(!adlar(out).includes(taze.yeni), 'gonderilmis olan bir daha secilmedi');

console.log('\n[5] Hepsi gonderildi -> IF in false koluna gider, mail gitmez');
store = { gonderilenler: arsiv.slice() };
out = liste(JSON.stringify(L));
ok(out.length === 1 && out[0].json.gonderilecek === false, 'gonderilecek=false, neden: ' + out[0].json.neden);

console.log('\n[6] Hata yollari: sessiz kalmaz, sebep bildirir');
for (const [ad, govde, sc] of [
  ['HTTP 403 / rate limit', '{"message":"API rate limit exceeded"}', 403],
  ['bozuk govde', '<html>proxy hatasi</html>', 200],
  ['dizi yerine nesne', '{"message":"Not Found"}', 200],
]) {
  const r = liste(govde, sc);
  ok(r.length === 1 && r[0].json.gonderilecek === false && !!r[0].json.neden,
    ad + ' -> "' + String(r[0].json.neden).slice(0, 50) + '"');
}

console.log('\n[7] Rutin yeni bulten push etti - latest.json HIC yazilmadan');
store = {};
out = liste(JSON.stringify(listeUret([sahteBulten('2099-01-01-1425.md')])));
ok(out[0].json.dosya === '2099-01-01-1425.md',
  'isaretci dosyasina bakilmadan yakalandi  <-- v1 in kirildigi yer');

console.log('\n[8] Tur basina limit + siralama');
store = { gonderilenler: [] };
const dortTaze = [1, 2, 3, 4].map(adUret);          // hepsi TAZE_SAAT icinde
out = liste(JSON.stringify(dortTaze.map(sahteBulten)));
ok(out.length === TUR_BASINA_LIMIT,
  'bekleyen ' + out[0].json.bekleyen + ' iken tek turda ' + TUR_BASINA_LIMIT + ' mail');
ok(JSON.stringify(adlar(out)) === JSON.stringify(dortTaze.slice(0, TUR_BASINA_LIMIT)),
  'en YENIDEN eskiye sirada: ' + JSON.stringify(adlar(out)));

console.log('\n[9] Backlog: eski bekleyenler postalanmaz, sessizce isaretlenir');
store = { gonderilenler: [] };
const backlog = [1, TAZE_SAAT + 24, TAZE_SAAT + 48, TAZE_SAAT + 72, TAZE_SAAT + 96].map(adUret);
out = liste(JSON.stringify(backlog.map(sahteBulten)));
ok(out.length === 1 && out[0].json.dosya === backlog[0],
  'yalnizca taze bulten postalandi (' + out.length + ' mail, ' + out[0].json.atlanan + ' atlandi)');
ok(backlog.slice(1).every((a) => store.gonderilenler.includes(a)),
  'eski ' + (backlog.length - 1) + ' bulten mail atilmadan gonderildi isaretlendi - sonraki turda sira beklemiyor');
ok(liste(JSON.stringify(backlog.map(sahteBulten)))[0].json.gonderilecek === false ||
   !adlar(liste(JSON.stringify(backlog.map(sahteBulten)))).some((a) => backlog.slice(1).includes(a)),
  'sonraki tur eski bultenleri tekrar secmiyor');

console.log('\n[10] Rutin gunlerce durdu: son bulten yas ne olursa olsun gider');
store = { gonderilenler: [] };
const cokEski = [TAZE_SAAT + 200, TAZE_SAAT + 300].map(adUret);
out = liste(JSON.stringify(cokEski.map(sahteBulten)));
ok(out.length === 1 && out[0].json.dosya === cokEski[0],
  'en yeni bekleyen (' + Math.round(TAZE_SAAT + 200) + ' saatlik) yine postalandi - sessiz kalmiyor');

console.log(hata === 0 ? '\n=== TUM TESTLER GECTI ===' : '\n=== ' + hata + ' TEST BASARISIZ ===');
process.exit(hata ? 1 : 0);
