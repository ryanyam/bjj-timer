const { app, BrowserWindow, Menu, protocol, session } = require("electron");
const { promises: fs } = require("node:fs");
const path = require("node:path");

const DEV_URL = process.env.BJJ_TIMER_DEV_URL;
const isDev = Boolean(DEV_URL) || process.argv.includes("--dev");
const windowed =
  isDev ||
  process.argv.includes("--windowed") ||
  process.env.BJJ_TIMER_WINDOWED === "1";

const DIST_ROOT = path.join(__dirname, "..", "dist");
const APP_ORIGIN = "app://bjj-timer";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    kiosk: !windowed,
    fullscreen: !windowed,
    autoHideMenuBar: true,
    backgroundColor: "#f4f4f2",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev
      ? Boolean(DEV_URL) && url.startsWith(DEV_URL)
      : url.startsWith(APP_ORIGIN);

    if (!allowed) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const modifier = input.control || input.meta;
    const key = input.key.toLowerCase();

    if (modifier && input.shift && key === "q") {
      event.preventDefault();
      app.quit();
    }

    if (isDev && modifier && input.shift && key === "i") {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  if (isDev && DEV_URL) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function serveAppProtocol(request) {
  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const requested = relative === "" ? "index.html" : relative;
  const filePath = path.resolve(DIST_ROOT, requested);

  if (
    filePath !== DIST_ROOT &&
    !filePath.startsWith(`${DIST_ROOT}${path.sep}`)
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await fs.readFile(filePath);
    const contentType =
      MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

    return new Response(data, {
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setPath("userData", path.join(app.getPath("appData"), "bjj-timer"));
    app.setName("BJJ Timer");
    Menu.setApplicationMenu(null);

    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );

    if (!isDev) {
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (_details, callback) => callback({ cancel: true }),
      );
    }

    protocol.handle("app", serveAppProtocol);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => app.quit());
}
