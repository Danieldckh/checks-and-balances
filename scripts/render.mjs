import matter from 'gray-matter';
import { marked } from 'marked';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

export function parseDraft(src) {
  const { data: frontmatter, content } = matter(src);

  const sections = {};
  let current = null;
  let buf = [];
  const flush = () => { if (current) sections[current] = buf.join('\n').trim(); };
  for (const line of content.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { flush(); current = m[1].toLowerCase(); buf = []; }
    else if (current) { buf.push(line); }
  }
  flush();

  const initiatives = splitSubsections(sections['initiatives'] ?? '').map(({ title, body }) => {
    const lines = body.split('\n');
    const meta = {};
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^- (\w+):\s*(.+?)\s*$/);
      if (m) { meta[m[1]] = m[2]; bodyStart = i + 1; }
      else if (lines[i].trim() === '') { bodyStart = i + 1; }
      else break;
    }
    return {
      title,
      repo: meta.repo ?? '',
      kind: meta.kind ?? '',
      body: lines.slice(bodyStart).join('\n').trim(),
    };
  });

  const days = splitSubsections(sections['days'] ?? '').map(({ title, body }) => ({
    label: title, body,
  }));

  return {
    frontmatter,
    lead: sections['lead'] ?? '',
    executiveSummary: sections['executive summary'] ?? '',
    initiatives,
    days,
    methodology: sections['methodology'] ?? '',
  };
}

function splitSubsections(block) {
  const out = [];
  let current = null;
  let buf = [];
  const flush = () => { if (current !== null) out.push({ title: current, body: buf.join('\n').trim() }); };
  for (const line of block.split('\n')) {
    const m = line.match(/^###\s+(.+?)\s*$/);
    if (m) { flush(); current = m[1]; buf = []; }
    else if (current !== null) { buf.push(line); }
  }
  flush();
  return out;
}

export function buildBarChartSvg(dailyVolume, opts = {}) {
  const width = opts.width ?? 720;
  const height = opts.height ?? 140;
  const padTop = 28;
  const padBottom = 28;
  const chartH = height - padTop - padBottom;
  const n = Math.max(1, dailyVolume.length);
  const slotW = width / n;
  const barW = Math.max(6, Math.min(28, slotW * 0.55));
  const max = Math.max(1, ...dailyVolume.map(d => d.count));

  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`];
  parts.push(`<line x1="0" y1="${padTop + chartH + 0.5}" x2="${width}" y2="${padTop + chartH + 0.5}" stroke="#d8dcd2" stroke-width="1"/>`);

  for (let i = 0; i < dailyVolume.length; i++) {
    const d = dailyVolume[i];
    const cx = slotW * i + slotW / 2;
    const x = cx - barW / 2;
    if (d.count > 0) {
      const h = (d.count / max) * chartH;
      const y = padTop + chartH - h;
      parts.push(`<rect class="bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="#1f4d2c"/>`);
      parts.push(`<text x="${cx.toFixed(2)}" y="${(y - 6).toFixed(2)}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" font-weight="600" fill="#1f4d2c">${d.count}</text>`);
    } else {
      const baseY = padTop + chartH - 4;
      parts.push(`<g class="zero" transform="translate(${x.toFixed(2)} ${baseY.toFixed(2)})">`);
      for (let k = 0; k < 3; k++) {
        const dotX = (barW / 4) + k * (barW / 4);
        parts.push(`<circle cx="${dotX.toFixed(2)}" cy="0" r="1.4" fill="#c8d0c2"/>`);
      }
      parts.push(`</g>`);
    }
    parts.push(`<text x="${cx.toFixed(2)}" y="${(padTop + chartH + 18).toFixed(2)}" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="#5a6068">${d.label}</text>`);
  }

  parts.push(`</svg>`);
  return parts.join('');
}

export function populateTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key]) : ''));
}

export function computeOutputFilename(stats, author) {
  if (stats.singleMonth) {
    return `${author.name}-${stats.monthLabel}-${stats.yearLabel}-Activity-Report.pdf`;
  }
  return `${author.name}-${stats.range.from}-to-${stats.range.to}-Activity-Report.pdf`;
}

function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInitiativesHtml(initiatives) {
  return initiatives.map((it, i) => `
    <div class="card">
      <div class="eyebrow">Initiative ${i + 1} · ${htmlEscape(it.kind || it.repo)}</div>
      <div class="card-title">${htmlEscape(it.title)}</div>
      ${marked.parse(it.body)}
    </div>
  `).join('\n');
}

function labelMatchesDate(label, isoDate) {
  // label might be "Fri 1 May" or "Mon 12 May" — extract day + month-abbrev
  const m = label.match(/(\d{1,2})\s+([A-Za-z]+)$/);
  if (!m) return false;
  const day = parseInt(m[1], 10);
  const monAbbrev = m[2].slice(0, 3).toLowerCase();
  const d = new Date(`${isoDate}T12:00:00Z`);
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return d.getUTCDate() === day && months[d.getUTCMonth()] === monAbbrev;
}

function renderDaysHtml(days, dailyVolume) {
  return days.map(day => {
    const match = dailyVolume.find(d => labelMatchesDate(day.label, d.date));
    const count = match ? match.count : '';
    return `
      <tr>
        <td class="col-date">${htmlEscape(day.label)}</td>
        <td class="col-commits"><span class="commit-pill">${count}</span></td>
        <td>${marked.parse(day.body)}</td>
      </tr>
    `;
  }).join('\n');
}

function renderMethodologyHtml(methodologyMd) {
  const i = methodologyMd.search(/\*\*Scope note\.\*\*/);
  if (i === -1) return marked.parse(methodologyMd);
  const before = methodologyMd.slice(0, i).trim();
  const note = methodologyMd.slice(i).replace(/^\*\*Scope note\.\*\*\s*/, '').trim();
  return `${marked.parse(before)}<div class="scope-note"><b>Scope note.</b> ${marked.parseInline(note)}</div>`;
}

export function renderDraftToHtml({ draft, stats, config, tokensCss, template }) {
  return populateTemplate(template, {
    tokensCss,
    title: htmlEscape(draft.frontmatter.title ?? ''),
    period: htmlEscape(draft.frontmatter.period ?? ''),
    generated: htmlEscape(draft.frontmatter.generated ?? ''),
    brandMark: htmlEscape(config.brand.mark),
    brandLine: htmlEscape(config.brand.line),
    brandSubline: htmlEscape(config.brand.subline),
    authorLine: htmlEscape(`${config.author.name} (${config.author.githubLogin})`),
    leadHtml: marked.parse(draft.lead),
    commitsPushed: draft.frontmatter.heroStats?.commitsPushed ?? stats.heroStats.commitsPushed,
    activeWorkdays: draft.frontmatter.heroStats?.activeWorkdays ?? stats.heroStats.activeWorkdays,
    reposShippedTo: draft.frontmatter.heroStats?.reposShippedTo ?? stats.heroStats.reposShippedTo,
    newAppsLaunched: draft.frontmatter.heroStats?.newAppsLaunched ?? stats.heroStats.newAppsLaunched,
    executiveSummaryHtml: marked.parse(draft.executiveSummary),
    initiativesHtml: renderInitiativesHtml(draft.initiatives),
    barChartSvg: buildBarChartSvg(stats.dailyVolume),
    daysHtml: renderDaysHtml(draft.days, stats.dailyVolume),
    methodologyHtml: renderMethodologyHtml(draft.methodology),
    footerLeft: htmlEscape(config.footerLeft),
    footerRightSuffix: htmlEscape(config.footerRightSuffix),
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--range') args.range = argv[++i];
  }
  if (!args.range) { console.error('Usage: render.mjs --range <from>_to_<to>'); process.exit(1); }
  return args;
}

async function main() {
  const { range } = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(resolve(ROOT, 'config.json'), 'utf8'));
  const draftSrc = readFileSync(resolve(ROOT, 'drafts', `${range}.md`), 'utf8');
  const stats = JSON.parse(readFileSync(resolve(ROOT, 'data', `${range}.stats.json`), 'utf8'));
  const template = readFileSync(resolve(ROOT, 'templates', 'report.html'), 'utf8');
  const tokensCss = readFileSync(resolve(ROOT, 'templates', '_tokens.css'), 'utf8');

  const draft = parseDraft(draftSrc);
  const html = renderDraftToHtml({ draft, stats, config, tokensCss, template });

  const htmlPath = resolve(ROOT, 'data', `${range}.rendered.html`);
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html);
  console.error(`HTML written: ${htmlPath}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });

  const outName = computeOutputFilename(stats, config.author);
  const outPath = resolve(ROOT, 'out', outName);
  mkdirSync(dirname(outPath), { recursive: true });
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
  });
  await browser.close();
  console.log(outPath);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
