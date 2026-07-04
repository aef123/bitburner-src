/* eslint-disable @typescript-eslint/no-var-requires */
const { app, shell, BrowserWindow } = require("electron");
const utils = require("./utils");
const achievements = require("./achievements");
const menu = require("./menu");
const path = require("path");
const { windowTracker } = require("./windowTracker");
const storage = require("./storage");

const openDevtools = process.argv.includes("--dev");

/**
 * Parse `--rfa-port=<n>` and `--rfa-address=<host>` from argv and return them as a plain
 * object suitable for merging into the `query` passed to window.loadFile().
 * Both flags are optional and additive — existing behaviour is unchanged when absent.
 */
function parseRfaArgs(argv) {
  const query = {};
  for (const arg of argv) {
    const portMatch = /^--rfa-port=(\d+)$/.exec(arg);
    if (portMatch) query.rfaPort = portMatch[1];
    const addrMatch = /^--rfa-address=(.+)$/.exec(arg);
    if (addrMatch) query.rfaAddress = addrMatch[1];
  }
  return query;
}

async function createWindow(killall) {
  const setStopProcessHandler = global.app_handlers.stopProcess;
  app.setAppUserModelId("Bitburner");

  let icon;
  if (process.platform == "linux") {
    icon = path.join(__dirname, "icon.png");
  }

  const tracker = windowTracker("main");

  const window = new BrowserWindow({
    icon,
    show: false,
    backgroundThrottling: false,
    backgroundColor: "#000000",
    title: "Bitburner",
    autoHideMenuBar: storage.isMenuHideEnabled(),
    x: tracker.state.x,
    y: tracker.state.y,
    width: tracker.state.width,
    height: tracker.state.height,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      nativeWindowOpen: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  setTimeout(() => tracker.track(window), 1000);
  if (tracker.state.isMaximized) window.maximize();

  window.removeMenu();
  const rfaQuery = parseRfaArgs(process.argv);
  const baseQuery = killall ? { noScripts: killall } : {};
  const queryParams = { ...baseQuery, ...rfaQuery };
  const loadOptions = Object.keys(queryParams).length > 0 ? { query: queryParams } : {};
  window.loadFile("index.html", loadOptions);
  window.once("ready-to-show", () => {
    utils.setZoomFactor(window, utils.getZoomFactor());
  });
  window.show();
  if (openDevtools) window.webContents.openDevTools();

  window.webContents.setWindowOpenHandler(({ url }) => {
    // File protocol is allowed because it will use the file protocol intercept from main.js
    if (url.startsWith("file://")) return { action: "allow" };
    // Only http and https requests will be forwarded to browser.
    // By using shell.openExternal and returning action: "deny"
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.backgroundThrottling = false;

  achievements.enableSyncingAchievements();
  utils.attachUnresponsiveAppHandler(window);

  menu.refreshMenu(window);
  setStopProcessHandler(window);

  return window;
}

module.exports = {
  createWindow,
};
