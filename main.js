'use strict';

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { openDb } = require('./src/dbManager');
const { createAppService, API_METHODS } = require('./src/appService');

function resolveDbPath() {
  if (process.env.ARMY_DB) return path.resolve(process.env.ARMY_DB);
  return app.isPackaged ? path.join(app.getPath('userData'), 'army.db') : path.join(__dirname, 'army.db');
}

let db;
let service;

function registerIpc() {
  for (const name of API_METHODS) {
    ipcMain.handle(name, (_event, ...args) => {
      try {
        return { ok: true, data: service[name](...args) };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    title: 'Army Scheduler',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    db = openDb(resolveDbPath());
    service = createAppService(db);
    registerIpc();
    if (app.isPackaged) Menu.setApplicationMenu(null);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('quit', () => { if (db) db.close(); });
}
