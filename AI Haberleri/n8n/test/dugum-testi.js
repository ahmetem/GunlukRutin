// ai-bulteni-mail-gonder-v2.json icindeki Code dugumlerini n8n olmadan calistirir.
//
//   node "AI Haberleri/n8n/test/dugum-testi.js"
//
// Workflow JSON'undaki jsCode'lari dogrudan okur (kopya degil), GitHub Contents
// API yanitini Bultenler/ klasorunden uretir ve Gmail yanitlarini taklit eder.
// Workflow'u elle duzenledikten sonra bunu calistir.

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

// ===========================================================================
console.log('\n[1] Ilk calisma: esikten yeni bultenler secilir, arsiv gonderilmis sayilir');
const L = listeUret();
const arsiv = L.filter((f) => bulten(f.name)).map((f) => f.name);
let out = liste(JSON.stringify(L));
const esikSonrasi = arsiv.filter((n) => n >= '2026-08-10-0000.md');
ok(out.every((o) => o.json.gonderilecek === true), 'tum itemlar gonderilecek=true');
ok(JSON.stringify(out.map((o) => o.json.dosya)) === JSON.stringify(esikSonrasi.slice(0, 3)),
  'secilen: ' + JSON.stringify(out.map((o) => o.json.dosya)));
ok(store.gonderilenler.length === arsiv.length - esikSonrasi.length,
  'tohumlama: ' + store.gonderilenler.length + '/' + arsiv.length + ' bulten gonderilmis isaretlendi');
ok(!store.gonderilenler.some((n) => !bulten(n)), 'README.md / latest.json listeye girmedi');
ok(out[0].json.url.startsWith('https://api.github.com/'), 'indirme URL i Contents API (raw CDN onbellegine takilmaz)');

console.log('\n[2] Mail govdesi: gercek bulten metinleriyle');
const hazir = [];
for (const it of out) {
  const md = fs.readFileSync(path.join(BULTENLER, it.json.dosya), 'utf8');
  const r = run('Mail govdesini hazirla', {
    json: { markdown: md }, input: wrap([{ json: { markdown: md } }]),
    node: (n) => {
      if (n === 'Gonderilmeyenleri bul') return { item: { json: it.json } };
      throw new Error('beklenmeyen dugum: ' + n);
    },
  });
  hazir.push({ json: r.json });
  const h1 = md.split(/\r?\n/).find((l) => l.trim().startsWith('# ')).trim().slice(2).trim();
  ok(r.json.konu === h1, it.json.dosya + ' -> konu = bultenin H1 i');
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
const isaret = run('Gonderildi olarak isaretle', {
  input: wrap([
    { json: { id: '19abc', threadId: '19abc', labelIds: ['SENT'] } },
    { json: { error: { code: 429, message: 'Rate limit exceeded' } } },
  ].slice(0, hazir.length)),
  node: (n) => {
    if (n === 'Mail govdesini hazirla') return { all: () => hazir };
    throw new Error('beklenmeyen dugum: ' + n);
  },
});
ok(JSON.stringify(isaret[0].json.gonderildi) === JSON.stringify([hazir[0].json.dosya]),
  'sadece Gmail in id dondurdugu dosya isaretlendi');
if (hazir.length > 1) {
  ok(isaret[0].json.basarisiz.length === 1 && isaret[0].json.basarisiz[0].dosya === hazir[1].json.dosya,
    'basarisiz dosya raporlandi ve isaretlenMEdi');
  console.log('\n[4] Sonraki saat: basarisiz olan tekrar denenir, basarili olan gitmez');
  out = liste(JSON.stringify(L));
  ok(out.some((o) => o.json.dosya === hazir[1].json.dosya), 'basarisiz olan yeniden secildi');
  ok(!out.some((o) => o.json.dosya === hazir[0].json.dosya), 'gonderilmis olan bir daha secilmedi');
}

console.log('\n[5] Hepsi gonderildi -> IF in false koluna gider, mail gitmez');
store.gonderilenler = arsiv.slice();
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
out = liste(JSON.stringify(listeUret([sahteBulten('2099-01-01-1425.md')])));
ok(out.length === 1 && out[0].json.dosya === '2099-01-01-1425.md',
  'isaretci dosyasina bakilmadan yakalandi  <-- v1 in kirildigi yer');

console.log('\n[8] Tur basina limit');
store = {};
out = liste(JSON.stringify(listeUret(
  ['1430', '1530', '1630', '1730'].map((s) => sahteBulten('2099-01-01-' + s + '.md')))));
ok(out.length === 3, 'bekleyen ' + out[0].json.bekleyen + ' iken tek turda 3 mail');
ok(out[0].json.dosya <= out[2].json.dosya, 'en eskiden baslayarak kronolojik sirada');

console.log(hata === 0 ? '\n=== TUM TESTLER GECTI ===' : '\n=== ' + hata + ' TEST BASARISIZ ===');
process.exit(hata ? 1 : 0);
