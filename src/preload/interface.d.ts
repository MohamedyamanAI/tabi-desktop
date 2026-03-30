export interface AppSettings {
    widgetActivated: boolean
    trayTimerActivated: boolean
    activityTrackingEnabled: boolean
}

export interface WindowActivity {
    id: number
    timestamp: string
    durationSeconds: number
    appName: string
    windowTitle: string
    url: string | null
    processId: number | null
    timeEntryId: string | null
    synced: boolean
    createdAt: string
}

export interface ActivitySampleRow {
    id: number
    timestamp: string
    keystrokes: number
    mouseClicks: number
    timeEntryId: string | null
    synced: boolean
    createdAt: string
}

export interface CurrentActivityBucket {
    timestamp: string
    keystrokes: number
    mouse_clicks: number
}

export interface WindowActivityStats {
    appName: string
    url: string | null
    windowTitle: string | null
    count: number
}

export interface IElectronAPI {
    loadPreferences: () => Promise<void>
    showMainWindow: () => void
    hideMainWindow: () => void
    showMiniWindow: () => void
    hideMiniWindow: () => void
    onUpdateAvailable: (callback: () => void) => void
    onUpdateNotAvailable: (callback: () => void) => void
    triggerUpdate: () => void
    startTimer: () => void
    stopTimer: () => void
    onOpenDeeplink: (callback: (url: string) => Promise<void>) => void
    onAutoUpdaterError: (callback: (error: string | undefined) => Promise<void>) => void
    onStartTimer: (callback: () => void) => void
    onStopTimer: (callback: () => void) => void
    updateTrayState: (timeEntry: string, showTimer: boolean) => void
    updateAutoUpdater: () => void
    updateOrgIdleSettings: (settings: { enabled: boolean; thresholdMinutes: number } | null) => void
    updateOrgActivitySettings: (
        settings: { activityTrackingEnabled: boolean; appActivitySyncEnabled: boolean } | null
    ) => void
    timerStateChanged: (running: boolean) => void
    onIdleDialogResponse: (
        callback: (data: { choice: number; idleStartTime: string; idleEndTime: string }) => void
    ) => () => void // Returns cleanup function to remove listener
    getSettings: () => Promise<{ success: boolean; data?: AppSettings; error?: string }>
    updateSettings: (
        settings: Partial<AppSettings>
    ) => Promise<{ success: boolean; data?: AppSettings; error?: string }>
    getWindowActivities: (startDate: string, endDate: string) => Promise<WindowActivity[]>
    getWindowActivityStats: (startDate: string, endDate: string) => Promise<WindowActivityStats[]>
    getAppIcon: (appName: string) => Promise<string | null>
    getAppIcons: (appNames: string[]) => Promise<Record<string, string | null>>
    clearIconCache: () => Promise<{ success: boolean }>
    checkScreenRecordingPermission: () => Promise<boolean>
    requestScreenRecordingPermission: () => Promise<boolean>
    checkAccessibilityTrusted: () => Promise<boolean>
    promptAccessibilityTrusted: () => Promise<boolean>
    deleteAllWindowActivities: () => Promise<{ success: boolean; error?: string }>
    deleteAllActivityPeriods: () => Promise<{ success: boolean; error?: string }>
    getActivitySamples: (startDate: string, endDate: string) => Promise<ActivitySampleRow[]>
    deleteAllActivitySamples: () => Promise<{ success: boolean; error?: string }>
    getUnsyncedActivitySamplesForTimeEntry: (
        timeEntryId: string,
        timeEntryStartUtc?: string | null
    ) => Promise<ActivitySampleRow[]>
    markActivitySamplesSynced: (
        ids: number[],
        timeEntryIdForAssign?: string | null
    ) => Promise<{ success: boolean; error?: string }>
    getCurrentActivityBucket: () => Promise<CurrentActivityBucket | null>
    getUnsyncedWindowActivitiesForTimeEntry: (
        timeEntryId: string,
        timeEntryStartUtc?: string | null
    ) => Promise<WindowActivity[]>
    markWindowActivitiesSynced: (
        ids: number[],
        timeEntryIdForAssign?: string | null
    ) => Promise<{ success: boolean; error?: string }>
    deleteLocalActivityForTimeEntries: (
        timeEntryIds: string[]
    ) => Promise<{ success: boolean; error?: string }>
    screenshotTimeEntryChanged: (timeEntryId: string | null) => void
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
    ) => void
    onScreenshotCaptured: (
        callback: (data: {
            filePath: string
            timeEntryId: string
            capturedAt: string
            base64: string
        }) => void
    ) => () => void
    sendScreenshotUploadResult: (filePath: string, success: boolean) => void
    getScreenshotPendingCount: () => Promise<number>
}

declare global {
    interface Window {
        electronAPI: IElectronAPI
    }
}
