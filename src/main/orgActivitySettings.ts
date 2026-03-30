import { ipcMain } from 'electron'
import { logger } from './logger'

export interface OrgActivitySettingsPayload {
    activityTrackingEnabled: boolean
    appActivitySyncEnabled: boolean
}

let activityTrackingEnabled = false
let appActivitySyncEnabled = false

export function getOrgActivitySettings(): OrgActivitySettingsPayload {
    return { activityTrackingEnabled, appActivitySyncEnabled }
}

export function isOrgActivityTrackingEnabled(): boolean {
    return activityTrackingEnabled
}

/**
 * Apply payload from renderer (logged out => null disables both).
 * Returns whether the activity-tracking flag changed (window + input pipelines).
 */
export function applyOrgActivitySettingsPayload(
    payload: OrgActivitySettingsPayload | null
): boolean {
    const nextActivity = payload?.activityTrackingEnabled ?? false
    const nextAppSync = payload?.appActivitySyncEnabled ?? false
    const changed = nextActivity !== activityTrackingEnabled
    activityTrackingEnabled = nextActivity
    appActivitySyncEnabled = nextAppSync
    logger.info('Org activity settings updated:', {
        activityTrackingEnabled,
        appActivitySyncEnabled,
    })
    return changed
}

export function registerOrgActivitySettingsIPC(
    onActivityTrackingToggled: (enabled: boolean) => void | Promise<void>
): void {
    ipcMain.on(
        'updateOrgActivitySettings',
        async (_event, payload: OrgActivitySettingsPayload | null) => {
            const prev = activityTrackingEnabled
            applyOrgActivitySettingsPayload(payload)
            if (activityTrackingEnabled !== prev) {
                await onActivityTrackingToggled(activityTrackingEnabled)
            }
        }
    )
}
