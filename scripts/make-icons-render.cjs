/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- CommonJS script run by Electron */
// Run inside Electron by make-icons.mjs: draws each SVG to a PNG at the requested size.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');

const jobs = JSON.parse(process.env.SCRB_ICON_RENDER);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<canvas id=c></canvas>');
  for (const { svg, size, file } of jobs) {
    const b64 = Buffer.from(fs.readFileSync(svg, 'utf8')).toString('base64');
    const png = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.getElementById('c');
        c.width = c.height = ${size};
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, ${size}, ${size});
        res(c.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = () => rej(new Error('svg failed to load'));
      img.src = 'data:image/svg+xml;base64,${b64}';
    })`);
    fs.writeFileSync(file, Buffer.from(png, 'base64'));
  }
  app.quit();
});
