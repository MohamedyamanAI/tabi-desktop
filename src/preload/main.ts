import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
// eslint-disable-next-line no-constant-condition
if (process.contextIsolated || true) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
        contextBridge.exposeInMainWorld('electronAPI', {
            onStartTimer: (callback) =>
                ipcRenderer.on('startTimer', (_event, value) => callback(value)),
            onStopTimer: (callback) =>
                ipcRenderer.on('stopTimer', (_event, value) => callback(value)),
            onOpenDeeplink: (callback) =>
                ipcRenderer.on('openDeeplink', (_event, value) => callback(value)),
            showMiniWindow: () => ipcRenderer.send('showMiniWindow'),
            hideMiniWindow: () => ipcRenderer.send('hideMiniWindow'),
            showMainWindow: () => ipcRenderer.send('showMainWindow'),
            triggerUpdate: () => ipcRenderer.send('triggerUpdate'),
            onUpdateAvailable: (callback) => ipcRenderer.on('updateAvailable', () => callback()),
            onUpdateNotAvailable: (callback) =>
                ipcRenderer.on('updateNotAvailable', () => callback()),
            onAutoUpdaterError: (callback) =>
                ipcRenderer.on('updateError', (_event, value) => callback(value)),
            updateTrayState: (timeEntry: string, showTimer: boolean) =>
                ipcRenderer.send('updateTrayState', timeEntry, showTimer),
            updateAutoUpdater: () => ipcRenderer.send('updateAutoUpdater'),
            updateOrgIdleSettings: (
                settings: { enabled: boolean; thresholdMinutes: number } | null
            ) => ipcRenderer.send('updateOrgIdleSettings', settings),
            updateOrgActivitySettings: (
                settings: {
                    activityTrackingEnabled: boolean
                    appActivitySyncEnabled: boolean
                } | null
            ) => ipcRenderer.send('updateOrgActivitySettings', settings),
            timerStateChanged: (running: boolean) => ipcRenderer.send('timerStateChanged', running),
            getWindowActivities: (startDate: string, endDate: string) =>
                ipcRenderer.invoke('getWindowActivities', startDate, endDate),
            getWindowActivityStats: (startDate: string, endDate: string) =>
                ipcRenderer.invoke('getWindowActivityStats', startDate, endDate),
            getAppIcon: (appName: string) => ipcRenderer.invoke('getAppIcon', appName),
            getAppIcons: (appNames: string[]) => ipcRenderer.invoke('getAppIcons', appNames),
            clearIconCache: () => ipcRenderer.invoke('clearIconCache'),
            onIdleDialogResponse: (callback) => {
                const listener = (_event, value) => callback(value)
                ipcRenderer.on('idleDialogResponse', listener)
                // Return cleanup function to remove the listener
                return () => ipcRenderer.removeListener('idleDialogResponse', listener)
            },
            getSettings: () => ipcRenderer.invoke('getSettings'),
            updateSettings: (settings) => ipcRenderer.invoke('updateSettings', settings),
            checkScreenRecordingPermission: () =>
                ipcRenderer.invoke('checkScreenRecordingPermission'),
            requestScreenRecordingPermission: () =>
                ipcRenderer.invoke('requestScreenRecordingPermission'),
            checkAccessibilityTrusted: () => ipcRenderer.invoke('checkAccessibilityTrusted'),
            promptAccessibilityTrusted: () => ipcRenderer.invoke('promptAccessibilityTrusted'),
            deleteAllWindowActivities: () => ipcRenderer.invoke('deleteAllWindowActivities'),
            deleteAllActivityPeriods: () => ipcRenderer.invoke('deleteAllActivityPeriods'),
            getActivitySamples: (startDate: string, endDate: string) =>
                ipcRenderer.invoke('getActivitySamples', startDate, endDate),
            deleteAllActivitySamples: () => ipcRenderer.invoke('deleteAllActivitySamples'),
            getUnsyncedActivitySamplesForTimeEntry: (
                timeEntryId: string,
                timeEntryStartUtc?: string | null
            ) =>
                ipcRenderer.invoke(
                    'getUnsyncedActivitySamplesForTimeEntry',
                    timeEntryId,
                    timeEntryStartUtc
                ),
            markActivitySamplesSynced: (ids: number[], timeEntryIdForAssign?: string | null) =>
                ipcRenderer.invoke('markActivitySamplesSynced', ids, timeEntryIdForAssign),
            getCurrentActivityBucket: () => ipcRenderer.invoke('getCurrentActivityBucket'),
            getUnsyncedWindowActivitiesForTimeEntry: (
                timeEntryId: string,
                timeEntryStartUtc?: string | null
            ) =>
                ipcRenderer.invoke(
                    'getUnsyncedWindowActivitiesForTimeEntry',
                    timeEntryId,
                    timeEntryStartUtc
                ),
            markWindowActivitiesSynced: (ids: number[], timeEntryIdForAssign?: string | null) =>
                ipcRenderer.invoke('markWindowActivitiesSynced', ids, timeEntryIdForAssign),
            deleteLocalActivityForTimeEntries: (timeEntryIds: string[]) =>
                ipcRenderer.invoke('deleteLocalActivityForTimeEntries', timeEntryIds),
            screenshotTimeEntryChanged: (timeEntryId: string | null) =>
                ipcRenderer.send('screenshotTimeEntryChanged', timeEntryId),
            updateOrgScreenshotSettings: (
                settings: {
                    enabled: boolean
                    intervalMinutes: number
                    blurred: boolean
                    hasScreenshotEntitlement?: boolean
                    isOrgBlocked?: boolean
                    orgScreenshotsEnabled?: boolean
                    tier?: string | null
                } | null
            ) => ipcRenderer.send('updateOrgScreenshotSettings', settings),
            onScreenshotCaptured: (callback) => {
                const listener = (_event, value) => callback(value)
                ipcRenderer.on('screenshotCaptured', listener)
                return () => ipcRenderer.removeListener('screenshotCaptured', listener)
            },
            sendScreenshotUploadResult: (filePath: string, success: boolean) =>
                ipcRenderer.send('screenshotUploadResult', { filePath, success }),
            getScreenshotPendingCount: () => ipcRenderer.invoke('getScreenshotPendingCount'),
        })
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
    // @ts-ignore (define in dts)
    window.api = api
}
