import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const fontDir = path.resolve('image-tools/fonts');

function getFontB64(filename) {
  try {
    const full = path.join(fontDir, filename);
    if (fs.existsSync(full)) {
      return fs.readFileSync(full).toString('base64');
    }
  } catch (err) {
    console.warn(`Font load error for ${filename}:`, err.message);
  }
  return '';
}

// Base64 fonts (WOFF)
const anton400B64 = getFontB64('Anton-normal-400.woff') || getFontB64('Anton-Regular.ttf');
const archivo400B64 = getFontB64('ArchivoBlack-normal-400.woff') || getFontB64('ArchivoBlack-Regular.ttf');

const oswald200B64 = getFontB64('Oswald-200.woff');
const oswald400B64 = getFontB64('Oswald-400.woff');
const oswald500B64 = getFontB64('Oswald-500.woff');
const oswald700B64 = getFontB64('Oswald-700.woff');

const playfair400B64 = getFontB64('PlayfairDisplay-normal-400.woff') || getFontB64('PlayfairDisplay-Regular.ttf');
const playfair700B64 = getFontB64('PlayfairDisplay-normal-700.woff') || getFontB64('PlayfairDisplay-Bold.ttf');
const playfair900B64 = getFontB64('PlayfairDisplay-normal-900.woff') || getFontB64('PlayfairDisplay-ExtraBold.ttf');
const playfairItalic400B64 = getFontB64('PlayfairDisplay-italic-400.woff') || getFontB64('PlayfairDisplay-MediumItalic.ttf');
const playfairItalic900B64 = getFontB64('PlayfairDisplay-italic-900.woff') || getFontB64('PlayfairDisplay-BoldItalic.ttf');

const inter400B64 = getFontB64('Inter-normal-400.woff') || getFontB64('Inter-Regular.ttf');
const inter600B64 = getFontB64('Inter-normal-600.woff') || getFontB64('Inter-SemiBold.ttf');
const inter800B64 = getFontB64('Inter-normal-800.woff') || getFontB64('Inter-ExtraBold.ttf');

export const EMBEDDED_FONTS_CSS = `
  @font-face {
    font-family: 'Anton';
    font-weight: 400;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${anton400B64}') format('woff');
  }
  @font-face {
    font-family: 'Archivo Black';
    font-weight: 400;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${archivo400B64}') format('woff');
  }
  @font-face {
    font-family: 'Oswald';
    font-weight: 200;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${oswald200B64}') format('woff');
  }
  @font-face {
    font-family: 'Oswald';
    font-weight: 400;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${oswald400B64}') format('woff');
  }
  @font-face {
    font-family: 'Oswald';
    font-weight: 500;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${oswald500B64}') format('woff');
  }
  @font-face {
    font-family: 'Oswald';
    font-weight: 700;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${oswald700B64}') format('woff');
  }
  @font-face {
    font-family: 'Playfair Display';
    font-weight: 400;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${playfair400B64}') format('woff');
  }
  @font-face {
    font-family: 'Playfair Display';
    font-weight: 700;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${playfair700B64}') format('woff');
  }
  @font-face {
    font-family: 'Playfair Display';
    font-weight: 900;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${playfair900B64}') format('woff');
  }
  @font-face {
    font-family: 'Playfair Display';
    font-weight: 400;
    font-style: italic;
    src: url('data:font/woff;charset=utf-8;base64,${playfairItalic400B64}') format('woff');
  }
  @font-face {
    font-family: 'Playfair Display';
    font-weight: 900;
    font-style: italic;
    src: url('data:font/woff;charset=utf-8;base64,${playfairItalic900B64}') format('woff');
  }
  @font-face {
    font-family: 'Inter';
    font-weight: 400;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${inter400B64}') format('woff');
  }
  @font-face {
    font-family: 'Inter';
    font-weight: 600;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${inter600B64}') format('woff');
  }
  @font-face {
    font-family: 'Inter';
    font-weight: 800;
    font-style: normal;
    src: url('data:font/woff;charset=utf-8;base64,${inter800B64}') format('woff');
  }
`;

export const PALETTES = {
  P1: { name: 'CREAM EDITORIAL', bg: '#F5F1E8', ink: '#141414', accent: '#C8202D', highlight: '#F2E24B', muted: '#7A7A7A' },
  P2: { name: 'MIDNIGHT', bg: '#0A0A0A', ink: '#FFFFFF', accent: '#FF8A1E', highlight: '#FFD9C7', muted: '#7A7A7A' },
  P3: { name: 'PAPER ELECTRIC', bg: '#F7F3EC', ink: '#111111', accent: '#1A56E8', highlight: '#F2E24B', muted: '#6B6B6B' },
  P4: { name: 'SIGNAL ORANGE', bg: '#E8541F', ink: '#FFFFFF', accent: '#141414', highlight: '#FFD9C7', muted: '#FFD9C7' },
  P5: { name: 'CARBON YELLOW', bg: '#0D0D0D', ink: '#FFFFFF', accent: '#F5E31C', highlight: '#F5E31C', muted: '#6E6E6E' },
  P6: { name: 'SAGE CALM', bg: '#6B7F63', ink: '#F2EFE6', accent: '#E8C547', highlight: '#E8C547', muted: '#A8B5A0' }
};

export const PAIRINGS = {
  A: {
    name: 'EDITORIAL SERIF',
    headlineFont: 'Playfair Display',
    headlineWeight: '900',
    bodyFont: 'Playfair Display',
    bodyWeight: '400',
    accentStyle: 'italic',
    factor: 0.58
  },
  B: {
    name: 'BOLD IMPACT',
    headlineFont: 'Anton',
    headlineWeight: '400',
    bodyFont: 'Oswald',
    bodyWeight: '500',
    accentStyle: 'normal',
    factor: 0.46
  },
  C: {
    name: 'CONDENSED MINIMAL',
    headlineFont: 'Oswald',
    headlineWeight: '700',
    headlineLetterSpacing: '2',
    bodyFont: 'Oswald',
    bodyWeight: '200',
    accentStyle: 'normal',
    factor: 0.46
  },
  D: {
    name: 'MODERN GROTESQUE',
    headlineFont: 'Archivo Black',
    headlineWeight: '400',
    bodyFont: 'Inter',
    bodyWeight: '400',
    accentStyle: 'normal',
    factor: 0.62
  }
};

export function renderGraphicAccent(accentType, palette, opts = {}) {
  switch (accentType) {
    case 'crack':
      return `<polyline points="840,160 808,380 870,590 818,830 892,1050 850,1210" fill="none" stroke="${palette.accent}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`;
    case 'thick-rule':
      const y = opts.ruleY || 580;
      return `<line x1="100" y1="${y}" x2="360" y2="${y}" stroke="${palette.accent}" stroke-width="6" stroke-linecap="square"/>`;
    case 'dots':
      const dotX = opts.dotX || 860;
      const dotY = opts.dotY || 200;
      return `
        <circle cx="${dotX}" cy="${dotY}" r="6" fill="${palette.accent}"/>
        <circle cx="${dotX + 24}" cy="${dotY}" r="6" fill="${palette.accent}"/>
        <circle cx="${dotX + 48}" cy="${dotY}" r="6" fill="${palette.accent}"/>
        <circle cx="${dotX + 72}" cy="${dotY}" r="6" fill="${palette.accent}"/>
      `;
    case 'large-circle':
      return `<circle cx="780" cy="560" r="180" fill="none" stroke="${palette.accent}" stroke-width="3" opacity="0.35"/>`;
    case 'chevrons':
      return `
        <polyline points="910,1140 940,1160 910,1180" fill="none" stroke="${palette.accent}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="928,1140 958,1160 928,1180" fill="none" stroke="${palette.accent}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    default:
      return '';
  }
}

/**
 * Validates SVG based on Master Prompt Rules
 */
export function validateSvg(svg) {
  const trimmed = svg.trim();
  if (!trimmed.startsWith('<svg')) throw new Error('Missing <svg> root element');
  if (trimmed.includes('<foreignObject>')) throw new Error('Forbidden <foreignObject> detected');
  if (!trimmed.includes('viewBox="0 0 1080 1350"')) throw new Error('Missing viewBox="0 0 1080 1350"');
  if (!trimmed.endsWith('</svg>')) throw new Error('Unclosed </svg> tag');
  return true;
}

/**
 * Converts SVG to PNG and JPEG with Sharp
 */
export async function exportPoster(svgContent, outBaseName) {
  validateSvg(svgContent);
  const svgPath = `${outBaseName}.svg`;
  const pngPath = `${outBaseName}.png`;
  const jpgPath = `${outBaseName}.jpg`;

  fs.writeFileSync(svgPath, svgContent);

  const svgBuf = Buffer.from(svgContent);
  await sharp(svgBuf, { density: 150 })
    .resize(1080, 1350)
    .png({ quality: 100 })
    .toFile(pngPath);

  await sharp(svgBuf, { density: 150 })
    .resize(1080, 1350)
    .jpeg({ quality: 95 })
    .toFile(jpgPath);

  return { svgPath, pngPath, jpgPath };
}
