import { ipcMain, app } from 'electron'
import type { AppUpdater } from 'electron-updater'
import electronUpdater from 'electron-updater'
import log from 'electron-log'

const R2_BASE_URL = 'https://pub-e438c5d641984ba181976c5209481fbd.r2.dev/releases/latest'

export function getAutoUpdater(): AppUpdater {
    // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
    // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
    const { autoUpdater } = electronUpdater
    log.transports.file.level = 'debug'
    autoUpdater.logger = log
    return autoUpdater
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

export function initializeAutoUpdater() {
    const updater = getAutoUpdater()

    if (process.platform === 'darwin') {
        const macArchDir = process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
        updater.setFeedURL({
            provider: 'generic',
            url: `${R2_BASE_URL}/${macArchDir}`,
        })
    }

    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowDowngrade = true

    setInterval(() => {
        updater.checkForUpdatesAndNotify()
    }, FOUR_HOURS_MS)
}

export function registerAutoUpdateListeners(mainWindow: Electron.BrowserWindow) {
    ipcMain.on('updateAutoUpdater', () => {
        // force dev update config
        getAutoUpdater().checkForUpdatesAndNotify()
    })

    getAutoUpdater().addListener('update-available', () => {
        mainWindow.webContents.send('updateAvailable')
    })

    getAutoUpdater().addListener('update-not-available', () => {
        mainWindow.webContents.send('updateNotAvailable')
    })

    getAutoUpdater().addListener('update-downloaded', () => {
        app.emit('before-quit')
        setTimeout(() => {
            getAutoUpdater().quitAndInstall()
        }, 500)
    })

    getAutoUpdater().addListener('error', (error) => {
        mainWindow.webContents.send('updateError', error.message)
    })

    ipcMain.on('triggerUpdate', () => {
        getAutoUpdater().downloadUpdate()
    })
}
