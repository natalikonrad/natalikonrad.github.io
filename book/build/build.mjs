/**
 * Сборка PDF-книги: Markdown → HTML → PDF.
 *
 *   node build.mjs            собрать книгу
 *   node build.mjs --html     оставить промежуточный HTML для отладки
 *
 * Результат: book/dist/krasota-iznutri.pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOOK = path.resolve(HERE, '..');
const ROOT = path.resolve(BOOK, '..');
const DIST = path.join(BOOK, 'dist');
const KEEP_HTML = process.argv.includes('--html');

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  process.env.CHROME_PATH,
];

const cfg = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.config.json'), 'utf8'));

/* ---------- шрифты: вшиваем в HTML, чтобы PDF не зависел от системы ---------- */

function fontFace(family, file, style = 'normal', weight = '400') {
  const b64 = fs.readFileSync(path.join(ROOT, 'fonts', file)).toString('base64');
  return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
         `src:url(data:font/woff2;base64,${b64}) format('woff2');font-display:block}`;
}

const FONTS = [
  fontFace('Cormorant', 'cormorant-normal.woff2', 'normal', '300 700'),
  fontFace('Cormorant', 'cormorant-italic.woff2', 'italic', '300 700'),
  fontFace('DM Sans', 'dmsans.woff2', 'normal', '100 900'),
].join('\n');

const CSS = fs.readFileSync(path.join(HERE, 'book.css'), 'utf8');

/* ---------- разбор глав ---------- */

function parseFrontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: src.slice(m[0].length) };
}

/** ::: note / practice / personal … ::: → врезки */
const CALLOUT_LABELS = { note: 'Важно', practice: 'Практика', story: 'Мой опыт', personal: 'Черновик — заполнить' };

function expandCallouts(md) {
  return md.replace(/^::: *(\w+)\r?\n([\s\S]*?)^::: *$/gm, (_, kind, inner) => {
    const label = CALLOUT_LABELS[kind] || kind;
    return `<div class="callout callout-${kind}">\n<div class="c-label">${label}</div>\n\n` +
           `${inner.trim()}\n\n</div>`;
  });
}

function loadChapters() {
  const dir = path.join(BOOK, 'content');
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(file => {
      const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(dir, file), 'utf8'));
      const titleMatch = /^#\s+(.+)$/m.exec(body);
      const title = meta.title || (titleMatch ? titleMatch[1].trim() : file);
      const md = body.replace(/^#\s+.+$/m, '').trim();
      return {
        file,
        part: meta.part ?? '0',
        number: meta.number || '',
        kicker: meta.kicker || '',
        toc: meta.toc || title,
        title,
        html: marked.parse(expandCallouts(md), { mangle: false, headerIds: false }),
      };
    });
}

/* ---------- сборка HTML ---------- */

const shell = (bodyHtml, extra = '') => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>${cfg.titlePlain}</title>
<style>${FONTS}\n${CSS}\n${extra}</style>
</head><body>${bodyHtml}</body></html>`;

function coverHtml() {
  return shell(`
<div class="cover">
  <div class="cover-top"><div class="cover-brand">${cfg.brand}</div></div>
  <div class="cover-mid">
    <div class="cover-rule"></div>
    <h1>${cfg.title}</h1>
    <div class="cover-sub">${cfg.subtitle}</div>
  </div>
  <div class="cover-bottom">${cfg.author}<span>${cfg.year}</span></div>
</div>`, '@page{margin:0}');
}

function interiorHtml(chapters) {
  const parts = new Map(cfg.parts.map(p => [p.id, p]));
  const out = [];

  // титул
  out.push(`<section class="frontmatter titlepage">
  <h1>${cfg.title}</h1>
  <div class="sub">${cfg.subtitle}</div>
  <div class="author">${cfg.author}</div>
</section>`);

  // оглавление
  const tocRows = [];
  let seen = null;
  for (const ch of chapters) {
    if (ch.part !== seen) {
      const p = parts.get(ch.part);
      tocRows.push(`<div class="toc-part">${p ? `Часть ${p.num} · ${p.title}` : ch.part}</div>`);
      seen = ch.part;
    }
    tocRows.push(`<div class="toc-item"><span class="toc-num">${ch.number || '·'}</span><span>${ch.toc}</span></div>`);
  }
  out.push(`<section class="frontmatter toc"><h2>Оглавление</h2>${tocRows.join('\n')}</section>`);

  // части и главы
  seen = null;
  for (const ch of chapters) {
    if (ch.part !== seen) {
      const p = parts.get(ch.part);
      if (p) {
        out.push(`<section class="part-divider">
  <div class="pd-num">${p.num}</div>
  <div class="pd-title">${p.title}</div>
  <div class="pd-rule"></div>
  <div class="pd-note">${p.note}</div>
</section>`);
      }
      seen = ch.part;
    }
    out.push(`<section class="chapter">
  <div class="chapter-head">
    ${ch.kicker ? `<div class="chapter-kicker">${ch.kicker}</div>` : ''}
    <h1>${ch.title}</h1>
    <div class="chapter-rule"></div>
  </div>
  ${ch.html}
</section>`);
  }

  return shell(out.join('\n'));
}

/* ---------- рендер ---------- */

async function render(browser, html, file, opts) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: file, printBackground: true, ...opts });
  await page.close();
}

const MM = 72 / 25.4;
const PAGE_W = 148 * MM;
const PAGE_H = 210 * MM;
const PAPER = rgb(0.980, 0.969, 0.949);   // #FAF7F2
const FOLIO = rgb(0.561, 0.486, 0.369);   // #8F7C5E

/**
 * Собирает финальный PDF.
 * Обложка копируется как есть. Каждая внутренняя страница кладётся поверх
 * заливки цветом бумаги — иначе поля остались бы белыми, — и получает колонцифру.
 */
async function assemble(coverFile, bodyFile, out) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const coverSrc = await PDFDocument.load(fs.readFileSync(coverFile));
  const [coverPage] = await doc.copyPages(coverSrc, [0]);
  doc.addPage(coverPage);

  const bodySrc = await PDFDocument.load(fs.readFileSync(bodyFile));
  const embedded = await doc.embedPages(bodySrc.getPages());

  embedded.forEach((sheet, i) => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER });
    page.drawPage(sheet, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

    if (i === 0) return;                    // титул без номера
    const label = String(i + 1);
    const size = 7.5;
    page.drawText(label, {
      x: (PAGE_W - font.widthOfTextAtSize(label, size)) / 2,
      y: 9 * MM,
      size, font, color: FOLIO,
    });
  });

  doc.setTitle(cfg.titlePlain);
  doc.setAuthor(cfg.author);
  doc.setSubject(cfg.subtitle);
  doc.setCreator(cfg.brand);
  fs.writeFileSync(out, await doc.save());
  return doc.getPageCount();
}

async function main() {
  fs.mkdirSync(DIST, { recursive: true });
  const chapters = loadChapters();
  if (!chapters.length) throw new Error('В book/content нет ни одного .md');

  const cover = coverHtml();
  const interior = interiorHtml(chapters);

  if (KEEP_HTML) {
    fs.writeFileSync(path.join(DIST, 'cover.html'), cover);
    fs.writeFileSync(path.join(DIST, 'interior.html'), interior);
  }

  const executablePath = CHROME_CANDIDATES.find(p => p && fs.existsSync(p));
  if (!executablePath) throw new Error('Не найден Chromium. Задай CHROME_PATH.');

  const browser = await chromium.launch({ executablePath });
  const coverPdf = path.join(DIST, '.cover.pdf');
  const bodyPdf = path.join(DIST, '.interior.pdf');

  // обложка — в край, без полей и без колонцифры
  await render(browser, cover, coverPdf, { preferCSSPageSize: true });

  // внутренний блок — поля + номера страниц
  await render(browser, interior, bodyPdf, { preferCSSPageSize: true });

  await browser.close();

  const out = path.join(DIST, 'krasota-iznutri.pdf');
  const pages = await assemble(coverPdf, bodyPdf, out);
  fs.unlinkSync(coverPdf);
  fs.unlinkSync(bodyPdf);

  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`✓ ${path.relative(ROOT, out)} — ${pages} стр., ${kb} КБ, глав: ${chapters.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
