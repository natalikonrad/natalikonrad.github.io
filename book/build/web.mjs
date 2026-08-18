/**
 * Веб-версия книги: Markdown → одностраничный HTML для публикации.
 *   node web.mjs   → book/dist/web.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOOK = path.resolve(HERE, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.config.json'), 'utf8'));

const CALLOUTS = { note: 'Важно', practice: 'Практика', story: 'Мой опыт', personal: 'Черновик — заполнить' };
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const slug = s => 'ch-' + s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,40);

function frontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0,i).trim()] = line.slice(i+1).trim();
  }
  return { meta, body: src.slice(m[0].length) };
}

const expand = md => md.replace(/^::: *(\w+)\r?\n([\s\S]*?)^::: *$/gm,
  (_, kind, inner) => `<aside class="callout c-${kind}">\n<p class="c-label">${CALLOUTS[kind]||kind}</p>\n\n${inner.trim()}\n\n</aside>`);

const chapters = fs.readdirSync(path.join(BOOK,'content'))
  .filter(f => f.endsWith('.md')).sort()
  .map(file => {
    const { meta, body } = frontMatter(fs.readFileSync(path.join(BOOK,'content',file),'utf8'));
    const title = (/^#\s+(.+)$/m.exec(body)?.[1] || file).trim();
    return {
      part: meta.part ?? '0',
      number: meta.number || '',
      kicker: meta.kicker || '',
      toc: meta.toc || title,
      title,
      id: slug(meta.toc || title),
      html: marked.parse(expand(body.replace(/^#\s+.+$/m,'').trim()), { mangle:false, headerIds:false }),
    };
  });

const parts = new Map(cfg.parts.map(p => [p.id, p]));

/* ---------- оглавление ---------- */
let nav = '', seen = null;
for (const ch of chapters) {
  if (ch.part !== seen) {
    const p = parts.get(ch.part);
    nav += `<p class="nav-part">${p ? `${p.num} · ${p.title}` : ch.part}</p>`;
    seen = ch.part;
  }
  nav += `<a class="nav-item" href="#${ch.id}"><span class="nav-num">${ch.number || '·'}</span><span>${ch.toc}</span></a>`;
}

/* ---------- текст ---------- */
let main = '', current = null;
for (const ch of chapters) {
  if (ch.part !== current) {
    const p = parts.get(ch.part);
    if (p) main += `<section class="part-mark" id="part-${p.id}">
  <span class="pm-num">${p.num}</span><h2>${p.title}</h2><p>${p.note}</p>
</section>`;
    current = ch.part;
  }
  main += `<article class="chapter" id="${ch.id}">
  <header>${ch.kicker ? `<p class="kicker">${ch.kicker}</p>` : ''}<h2>${ch.title}</h2></header>
  ${ch.html}
</article>`;
}

const html = `<title>${cfg.titlePlain}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300..700;1,300..700&family=DM+Sans:opsz,wght@9..40,300..700&display=swap">
<style>
:root{
  --paper:#FAF7F2; --ink:#1A1614; --soft:#5C534C; --gold:#8F7C5E; --gold-2:#B5A080;
  --line:#E4DCD1; --panel:#F3EEE6; --dark:#151210; --dark-ink:#EDE7DE;
  --bg:var(--paper); --fg:var(--ink); --muted:var(--soft); --rule:var(--line);
  --accent:var(--gold); --surface:var(--panel); --invert-bg:var(--dark); --invert-fg:#F4EFE7;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#151210; --fg:#EDE7DE; --muted:#A2978B; --rule:#2E2823;
    --accent:#C3AE8C; --surface:#1E1A16; --invert-bg:#0D0B0A; --invert-fg:#F4EFE7;
  }
}
:root[data-theme="dark"]{
  --bg:#151210; --fg:#EDE7DE; --muted:#A2978B; --rule:#2E2823;
  --accent:#C3AE8C; --surface:#1E1A16; --invert-bg:#0D0B0A; --invert-fg:#F4EFE7;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--fg);
  font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:17px; line-height:1.68; -webkit-font-smoothing:antialiased;
}
#progress{position:fixed;top:0;left:0;height:2px;width:0;background:var(--accent);z-index:60;transition:width .1s linear}

/* ---- каркас ---- */
.shell{display:grid;grid-template-columns:288px minmax(0,1fr);gap:0;max-width:1240px;margin:0 auto}
.rail{
  position:sticky;top:0;height:100vh;overflow-y:auto;padding:40px 28px 60px;
  border-right:1px solid var(--rule);
}
.rail-brand{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--accent);margin:0 0 24px}
.rail-title{font-family:'Cormorant',Georgia,serif;font-weight:400;font-size:27px;line-height:1.1;margin:0 0 4px}
.rail-title em{font-style:italic;color:var(--accent)}
.rail-sub{font-size:12.5px;color:var(--muted);margin:0 0 26px;line-height:1.5}
.nav-part{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin:22px 0 8px}
.nav-item{
  display:flex;gap:10px;align-items:baseline;padding:5px 0;
  font-size:14px;color:var(--muted);text-decoration:none;line-height:1.4;
  border-left:2px solid transparent;padding-left:10px;margin-left:-12px;transition:color .15s,border-color .15s;
}
.nav-item:hover{color:var(--fg)}
.nav-item.active{color:var(--fg);border-left-color:var(--accent)}
.nav-num{font-family:'Cormorant',serif;font-size:15px;color:var(--accent);min-width:16px;font-variant-numeric:tabular-nums}

.reader{padding:0 clamp(20px,5vw,72px) 140px;min-width:0}

/* ---- шапка ---- */
.hero{padding:96px 0 72px;border-bottom:1px solid var(--rule);margin-bottom:24px}
.hero .eyebrow{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);margin:0 0 22px}
.hero h1{
  font-family:'Cormorant',Georgia,serif;font-weight:400;font-size:clamp(44px,7vw,76px);
  line-height:1.02;margin:0 0 20px;text-wrap:balance;letter-spacing:-.01em;
}
.hero h1 em{font-style:italic;color:var(--accent)}
.hero .lede{font-size:19px;color:var(--muted);max-width:34ch;margin:0 0 30px;line-height:1.55}
.hero .by{font-family:'Cormorant',serif;font-size:19px;letter-spacing:.04em}
.hero .meta{display:flex;gap:26px;flex-wrap:wrap;margin-top:34px;font-size:13px;color:var(--muted)}
.hero .meta b{display:block;font-family:'Cormorant',serif;font-size:26px;font-weight:500;color:var(--fg);line-height:1}

/* ---- шмуцтитул части ---- */
.part-mark{
  margin:104px 0 56px;padding:52px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);
  text-align:center;
}
.part-mark .pm-num{font-family:'Cormorant',serif;font-size:56px;color:var(--accent);line-height:1;display:block}
.part-mark h2{font-family:'Cormorant',serif;font-weight:400;font-size:34px;margin:8px 0 12px;letter-spacing:.03em}
.part-mark p{color:var(--muted);max-width:44ch;margin:0 auto;font-size:15px}

/* ---- глава ---- */
.chapter{max-width:65ch;margin:0 0 88px;scroll-margin-top:24px}
.chapter>header{margin:64px 0 28px}
.chapter .kicker{font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);margin:0 0 10px}
.chapter>header h2{
  font-family:'Cormorant',Georgia,serif;font-weight:400;font-size:clamp(30px,4vw,42px);
  line-height:1.1;margin:0;text-wrap:balance;
}
.chapter h2:not(:first-child){font-family:'Cormorant',serif;font-weight:600;font-size:25px;margin:52px 0 12px;line-height:1.25}
.chapter h3{font-size:16px;font-weight:600;margin:34px 0 8px;letter-spacing:.005em}
.chapter p{margin:0 0 18px}
.chapter strong{font-weight:600}
.chapter ul,.chapter ol{margin:0 0 20px;padding-left:22px}
.chapter li{margin-bottom:7px}
.chapter li::marker{color:var(--accent)}
.chapter hr{border:0;height:1px;background:var(--rule);margin:44px 0}
.chapter a{color:var(--accent)}
blockquote{margin:26px 0;padding-left:20px;border-left:2px solid var(--accent);
  font-family:'Cormorant',serif;font-size:23px;line-height:1.4;font-style:italic;color:var(--accent)}

/* ---- таблицы ---- */
.tw{overflow-x:auto;margin:26px 0;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:14.5px;min-width:420px}
th{text-align:left;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--accent);
  border-bottom:1px solid var(--accent);padding:0 14px 9px 0;font-weight:600;white-space:nowrap}
td{padding:11px 14px 11px 0;border-bottom:1px solid var(--rule);vertical-align:top}

/* ---- врезки ---- */
.callout{margin:30px 0;padding:22px 26px;border-radius:3px;font-size:15.5px;line-height:1.6}
.callout p:last-child{margin-bottom:0}
.callout .c-label{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;margin:0 0 12px;color:var(--accent)}
.callout table{font-size:14px}
.c-note{background:var(--surface);border-left:2px solid var(--accent)}
.c-practice{background:var(--invert-bg);color:var(--invert-fg)}
.c-practice .c-label{color:var(--gold-2)}
.c-practice td{border-bottom-color:rgba(255,255,255,.13)}
.c-practice th{color:var(--gold-2);border-bottom-color:rgba(181,160,128,.5)}
.c-practice li::marker{color:var(--gold-2)}
.c-story{background:var(--surface);border-left:2px solid var(--accent);
  font-family:'Cormorant',Georgia,serif;font-size:20px;line-height:1.5}
.c-story .c-label{font-family:'DM Sans',sans-serif;font-size:10.5px}
.c-personal{border:1px dashed var(--accent);background:transparent;color:var(--muted);font-style:italic}

.figure{margin:34px 0;text-align:center}
.figure svg{width:100%;height:auto;max-width:600px}
.figure figcaption{font-size:13px;color:var(--muted);margin-top:10px;line-height:1.5}
.dg-axis{stroke:var(--accent);stroke-width:1;stroke-dasharray:3 3}
.dg-body{fill:none;stroke:var(--fg);stroke-width:1.6;stroke-linejoin:round}
.dg-dot{fill:var(--accent)}
.dg-box{fill:none;stroke:var(--rule);stroke-width:1}
.dg-cap{font-family:'DM Sans',sans-serif;font-size:11px;fill:var(--fg);font-weight:600}
.dg-key{font-family:'DM Sans',sans-serif;font-size:10.5px;fill:var(--muted)}
.dg-fl{font-family:'Cormorant',serif;font-size:17px;fill:var(--accent)}
.dg-brk{fill:none;stroke:var(--accent);stroke-width:1.2}
.dg-brk-l{fill:none;stroke:var(--rule);stroke-width:1.2}

/* ---- служебное ---- */
.tools{position:fixed;right:20px;bottom:20px;display:flex;gap:8px;z-index:50}
.tools button{
  font:inherit;font-size:13px;padding:9px 14px;border-radius:100px;cursor:pointer;
  background:var(--bg);color:var(--fg);border:1px solid var(--rule);box-shadow:0 2px 14px rgba(0,0,0,.09);
}
.tools button:hover{border-color:var(--accent)}
.tools button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.menu-btn{display:none}
.foot{max-width:65ch;margin:80px 0 0;padding-top:26px;border-top:1px solid var(--rule);
  font-size:13px;color:var(--muted)}

@media (max-width:900px){
  .shell{grid-template-columns:1fr}
  .rail{
    position:fixed;inset:0 auto 0 0;width:290px;z-index:70;background:var(--bg);
    transform:translateX(-100%);transition:transform .25s ease;border-right:1px solid var(--rule);
  }
  .rail.open{transform:none;box-shadow:0 0 60px rgba(0,0,0,.3)}
  .menu-btn{display:block}
  .hero{padding:64px 0 48px}
  body{font-size:16.5px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
html{scroll-behavior:smooth}
</style>

<div id="progress"></div>

<div class="shell">
  <nav class="rail" id="rail">
    <p class="rail-brand">${cfg.brand}</p>
    <p class="rail-title">Красота <em>изнутри</em></p>
    <p class="rail-sub">${cfg.subtitle}</p>
    ${nav}
  </nav>

  <main class="reader">
    <header class="hero">
      <p class="eyebrow">${cfg.brand} · ${cfg.year}</p>
      <h1>Красота <em>изнутри</em></h1>
      <p class="lede">${cfg.subtitle}</p>
      <p class="by">${cfg.author}</p>
      <div class="meta">
        <span><b>${chapters.filter(c=>c.part!=='V').length}</b>глав</span>
        <span><b>4</b>приложения</span>
        <span><b>5</b>частей</span>
      </div>
    </header>
    ${main}
    <p class="foot">Черновик. Блоки, обведённые пунктиром, ждут личных историй автора.<br>
    Книга не заменяет консультацию врача.</p>
  </main>
</div>

<div class="tools">
  <button class="menu-btn" id="menu" aria-label="Оглавление">Оглавление</button>
  <button id="theme" aria-label="Сменить тему">Тема</button>
</div>

<script>
(function(){
  document.querySelectorAll('table').forEach(function(t){
    if(t.parentElement.classList.contains('tw')) return;
    var w=document.createElement('div'); w.className='tw';
    t.parentNode.insertBefore(w,t); w.appendChild(t);
  });

  var bar=document.getElementById('progress');
  var rail=document.getElementById('rail');
  var links=[].slice.call(document.querySelectorAll('.nav-item'));
  var targets=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1));});

  function onScroll(){
    var h=document.documentElement.scrollHeight-window.innerHeight;
    bar.style.width=(h>0?(window.scrollY/h)*100:0)+'%';
    var idx=0;
    for(var i=0;i<targets.length;i++){
      if(targets[i] && targets[i].getBoundingClientRect().top<=120) idx=i;
    }
    links.forEach(function(a,i){a.classList.toggle('active',i===idx);});
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  onScroll();

  document.getElementById('menu').addEventListener('click',function(){rail.classList.toggle('open');});
  rail.addEventListener('click',function(e){if(e.target.closest('.nav-item')) rail.classList.remove('open');});

  document.getElementById('theme').addEventListener('click',function(){
    var r=document.documentElement;
    var dark=r.getAttribute('data-theme')==='dark' ||
      (!r.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    r.setAttribute('data-theme',dark?'light':'dark');
  });
})();
</script>`;

const out = path.join(BOOK, 'dist', 'web.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`✓ ${path.relative(BOOK, out)} — ${(html.length/1024).toFixed(0)} КБ, разделов: ${chapters.length}`);
