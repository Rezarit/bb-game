import { app, BrowserWindow, protocol, net, Menu, shell, ipcMain } from 'electron';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const isDev = !app.isPackaged;
const RENDERER_DIR = join(__dirname, '../renderer');

// 固定存档目录名。Electron 默认用 productName（"轮回"）当 userData 目录名，
// 中文目录在终端/脚本里会变乱码，而且在开发版和打包版之间会分裂成两个目录。
// 固定成 ASCII 后，两种运行方式共用同一份存档。
app.setName('bb-game');

// 生产环境用 app:// 而不是 file://。
// file:// 下 Phaser 的 fetch / WebAudio / 字体加载会被 Chromium 的
// 同源策略拦掉，这是 Electron + Web 游戏最常见的坑。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

function createWindow(show = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0d0f14',
    show: false,
    title: '轮回',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 游戏窗口失焦时不要降帧
      backgroundThrottling: false,
    },
  });

  if (show) win.once('ready-to-show', () => win.show());

  // 开发期把渲染进程的报错打到终端，否则白屏时什么都看不到
  if (!app.isPackaged) {
    win.webContents.on('console-message', (e) => {
      const text = e.message ?? '';
      if (e.level === 'error' || e.level === 'warning') {
        console.log(`[renderer:${e.level}] ${text}`);
      } else if (text.startsWith('STATE:')) {
        console.log(text);
      }
    });
    win.webContents.on('render-process-gone', (_e, d) => {
      console.error('[renderer gone]', d.reason, d.exitCode);
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('[load failed]', code, desc, url);
    });
    win.webContents.on('preload-error', (_e, p, err) => {
      console.error('[preload error]', p, err);
    });
  }

  // 外部链接一律交给系统浏览器，不在应用内开窗
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !url.startsWith('http://localhost')) e.preventDefault();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadURL('app://game/index.html');
  }

  return win;
}

// ---------------------------------------------------------------- 存档 IO

const saveDir = () => join(app.getPath('userData'), 'saves');

async function ensureSaveDir() {
  await mkdir(saveDir(), { recursive: true });
}

ipcMain.handle('save:write', async (_e, slot: string, data: string) => {
  await ensureSaveDir();
  const file = join(saveDir(), `${slot}.json`);
  // 先写临时文件再改名，避免断电/崩溃时写坏存档
  const tmp = file + '.tmp';
  await writeFile(tmp, data, 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(tmp, file);
  return true;
});

ipcMain.handle('save:read', async (_e, slot: string) => {
  try {
    return await readFile(join(saveDir(), `${slot}.json`), 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('save:delete', async (_e, slot: string) => {
  const { rm } = await import('node:fs/promises');
  try {
    await rm(join(saveDir(), `${slot}.json`));
    return true;
  } catch {
    return false;
  }
});

// ---------------------------------------------------------------- 生命周期

app.whenReady().then(() => {
  // app://game/xxx -> RENDERER_DIR/xxx
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname === '/' || url.pathname === '' ? '/index.html' : url.pathname);
    const file = resolve(RENDERER_DIR, '.' + rel);
    // 目录穿越防护
    if (!file.startsWith(resolve(RENDERER_DIR))) {
      return new Response('forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  Menu.setApplicationMenu(null);

  // --shot=路径：开发期截图模式，用来验证界面
  const shot = process.argv.find((a) => a.startsWith('--shot='))?.slice('--shot='.length);
  if (shot) {
    void runShot(shot);
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * 启动、等一会儿、截图、退出。仅开发期使用。
 *
 *   npx electron . --shot=out.png --shot-script="$(cat scripts/autoplay.js)" --shot-wait=8000
 *
 * 注意：executeJavaScript 里不能用 `[...nodeList]` 展开语法（会被当成顶层表达式求值失败），
 * 自动播放脚本必须写成 ES5 风格。
 */
async function runShot(outPath: string) {
  const { writeFile } = await import('node:fs/promises');
  const win = createWindow(false);
  await new Promise<void>((r) => {
    win.webContents.once('did-finish-load', () => r());
  });

  const arg = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const wait = Number(arg('shot-wait') ?? 1200);

  const script = arg('shot-script');
  if (script) {
    try {
      await win.webContents.executeJavaScript(script);
    } catch (e) {
      console.error('[shot-script]', e);
    }
  }

  if (process.argv.includes('--shot-track')) {
    const started = Date.now();
    while (Date.now() - started < wait) {
      await new Promise((r) => setTimeout(r, 400));
      const s = (await win.webContents.executeJavaScript(
        `document.body.dataset.phase+'/'+document.body.dataset.cycle+'/'+document.body.dataset.status`,
      )) as string;
      console.log(`[track ${Date.now() - started}ms]`, s);
    }
  } else {
    await new Promise((r) => setTimeout(r, wait));
  }

  const info = (await win.webContents.executeJavaScript(
    `JSON.stringify({
       phase: document.body.dataset.phase,
       cycle: document.body.dataset.cycle,
       status: document.body.dataset.status,
       text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160),
     })`,
  )) as string;
  console.log('[state]', info);

  const img = await win.webContents.capturePage();
  await writeFile(outPath, img.toPNG());
  console.log('saved', outPath);
  app.quit();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
