import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';

const rootDir = process.cwd();
const pngRoot = path.join(rootDir, 'png');
const webpRoot = path.join(rootDir, 'webp');
const skipDirs = new Set(['node_modules', 'png', 'webp', 'upstream']);
const cellSize = 24;
const cellGap = 8;
const sheetColumns = 64;
const sheetPadding = 8;

sharp.cache(false);

async function main() {
  const svgFiles = (await collectSvgFiles(rootDir)).sort();

  await fs.rm(pngRoot, { recursive: true, force: true });
  await fs.rm(webpRoot, { recursive: true, force: true });
  await fs.mkdir(pngRoot, { recursive: true });
  await fs.mkdir(webpRoot, { recursive: true });

  const queue = [...svgFiles];
  const concurrency = Math.min(8, Math.max(1, os.cpus().length));
  let converted = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const svgFile = queue.shift();

        if (!svgFile) {
          continue;
        }

        await convertFile(svgFile);

        converted += 1;

        if (converted % 100 === 0 || converted === svgFiles.length) {
          console.log(`Converted ${converted}/${svgFiles.length} SVG files`);
        }
      }
    }),
  );

  console.log(`Generated PNG and WEBP assets for ${svgFiles.length} SVG files.`);
}

async function collectSvgFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) {
        continue;
      }

      files.push(...(await collectSvgFiles(path.join(dir, entry.name))));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.svg')) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

async function convertFile(svgFile) {
  const relativePath = path.relative(rootDir, svgFile).split(path.sep).join('/');
  const source = await fs.readFile(svgFile, 'utf8');
  const renderSource = buildRenderSource(relativePath, source);
  const targetBase = relativePath.replace(/\.svg$/i, '');
  const pngFile = path.join(pngRoot, `${targetBase}.png`);
  const webpFile = path.join(webpRoot, `${targetBase}.webp`);

  await fs.mkdir(path.dirname(pngFile), { recursive: true });
  await fs.mkdir(path.dirname(webpFile), { recursive: true });

  await sharp(Buffer.from(renderSource))
    .png({ compressionLevel: 9 })
    .toFile(pngFile);

  await sharp(Buffer.from(renderSource))
    .webp({ lossless: true })
    .toFile(webpFile);
}

function buildRenderSource(relativePath, source) {
  if (relativePath === 'sprite.svg') {
    return buildSymbolSheet(source, {
      rootAttributes:
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="#000"',
    });
  }

  if (relativePath === 'font/lucide.symbol.svg') {
    return buildSymbolSheet(source, { rootAttributes: 'color="#000"' });
  }

  if (relativePath === 'font/lucide.svg') {
    return buildFontSheet(source);
  }

  return source;
}

function buildSymbolSheet(source, { rootAttributes }) {
  const inner = extractSvgInner(source);
  const symbols = [...source.matchAll(/<symbol\b[^>]*id="([^"]+)"/g)].map((match) => match[1]);

  if (symbols.length === 0) {
    return source;
  }

  const { width, height, uses } = buildGrid(symbols, (symbolId, x, y) => {
    const escapedId = escapeAttribute(symbolId);
    return `<use href="#${escapedId}" xlink:href="#${escapedId}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" />`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${rootAttributes}>`,
    inner,
    uses,
    '</svg>',
  ].join('');
}

function buildFontSheet(source) {
  const unitsPerEm = Number(source.match(/units-per-em="([^"]+)"/)?.[1] ?? '1000');
  const ascent = Number(source.match(/ascent="([^"]+)"/)?.[1] ?? `${unitsPerEm}`);
  const glyphs = [...source.matchAll(/<glyph\b[^>]*glyph-name="([^"]+)"[^>]*d="([^"]+)"[^>]*\/>/g)].map(
    (match) => ({
      glyphName: match[1],
      pathData: match[2],
    }),
  );

  if (glyphs.length === 0) {
    return source;
  }

  const scale = cellSize / unitsPerEm;
  const { width, height, uses } = buildGrid(glyphs, ({ glyphName, pathData }, x, y) => {
    const titleId = escapeAttribute(`glyph-${glyphName}`);
    return [
      `<g transform="translate(${x}, ${y + cellSize}) scale(${scale}, ${-scale})">`,
      `<title id="${titleId}">${escapeText(glyphName)}</title>`,
      `<path d="${pathData}" aria-labelledby="${titleId}" transform="translate(0, ${-ascent + unitsPerEm})" />`,
      '</g>',
    ].join('');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="#000">`,
    uses,
    '</svg>',
  ].join('');
}

function buildGrid(items, renderItem) {
  const columns = Math.min(sheetColumns, items.length);
  const rows = Math.ceil(items.length / columns);
  const width = sheetPadding * 2 + columns * cellSize + (columns - 1) * cellGap;
  const height = sheetPadding * 2 + rows * cellSize + (rows - 1) * cellGap;
  const uses = items
    .map((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = sheetPadding + column * (cellSize + cellGap);
      const y = sheetPadding + row * (cellSize + cellGap);

      return renderItem(item, x, y);
    })
    .join('');

  return { width, height, uses };
}

function extractSvgInner(source) {
  const match = source.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
  return match ? match[1] : source;
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

await main();
