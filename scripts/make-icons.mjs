// Builds the app icon set from one concept's SVGs in docs/design/icons. No network.
//   node scripts/make-icons.mjs [bubble|wave|nib]     (default: bubble)
// Output: apps/desktop/assets/icons/{icon.icns (macOS only), icon.ico, icon.png, icon-win.png}.
// To swap the icon, rerun with another concept name and commit the result.
// Rendering uses the Electron already installed (scripts/make-icons-render.cjs), so no other tool is needed.
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const concept = process.argv[2] ?? 'bubble';
const outDir = path.join(root, 'apps/desktop/assets/icons');
const svgDir = path.join(root, 'docs/design/icons');

{
  const macSvg = path.join(svgDir, `scribe-${concept}.svg`);
  const winSvg = path.join(svgDir, `scribe-${concept}-win.svg`);
  if (!fs.existsSync(macSvg) || !fs.existsSync(winSvg)) {
    throw new Error(
      `Unknown concept "${concept}": expected scribe-${concept}[-win].svg in ${svgDir}`,
    );
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scrb-icons-'));
  const iconset = path.join(tmp, 'icon.iconset');
  fs.mkdirSync(iconset);
  fs.mkdirSync(outDir, { recursive: true });

  const jobs = [];
  const macSizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of macSizes)
    jobs.push({ svg: macSvg, size: s, file: path.join(tmp, `mac-${s}.png`) });
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  for (const s of icoSizes)
    jobs.push({ svg: winSvg, size: s, file: path.join(tmp, `win-${s}.png`) });
  jobs.push({ svg: winSvg, size: 512, file: path.join(tmp, 'win-512.png') });

  const electron = createRequire(import.meta.url)('electron');
  execFileSync(electron, [path.join(root, 'scripts/make-icons-render.cjs')], {
    env: { ...process.env, SCRB_ICON_RENDER: JSON.stringify(jobs) },
    stdio: 'inherit',
  });

  // .ico: PNG-compressed entries (Windows Vista and later).
  const entries = icoSizes.map((s) => ({
    s,
    data: fs.readFileSync(path.join(tmp, `win-${s}.png`)),
  }));
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ s, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, at);
    header.writeUInt8(s >= 256 ? 0 : s, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  fs.writeFileSync(
    path.join(outDir, 'icon.ico'),
    Buffer.concat([header, ...entries.map((e) => e.data)]),
  );
  fs.copyFileSync(path.join(tmp, 'mac-512.png'), path.join(outDir, 'icon.png'));
  fs.copyFileSync(path.join(tmp, 'win-512.png'), path.join(outDir, 'icon-win.png'));

  if (process.platform === 'darwin') {
    const names = {
      16: ['icon_16x16'],
      32: ['icon_16x16@2x', 'icon_32x32'],
      64: ['icon_32x32@2x'],
      128: ['icon_128x128'],
      256: ['icon_128x128@2x', 'icon_256x256'],
      512: ['icon_256x256@2x', 'icon_512x512'],
      1024: ['icon_512x512@2x'],
    };
    for (const [s, list] of Object.entries(names)) {
      for (const n of list)
        fs.copyFileSync(path.join(tmp, `mac-${s}.png`), path.join(iconset, `${n}.png`));
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(outDir, 'icon.icns')]);
  } else {
    console.log('Not macOS: icon.icns left as committed (iconutil is macOS only).');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Icons written to ${path.relative(root, outDir)} from concept "${concept}".`);
}
