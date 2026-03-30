import { ipcMain } from 'electron'
import { db } from './db/client'
import { activitySamples, windowActivities } from './db/schema'
import { inArray } from 'drizzle-orm'

/**
 * Removes local activity_samples and window_activities rows for deleted time entries.
 * Local SQLite has no ON DELETE CASCADE from the server; this keeps stats in sync.
 */
export function registerLocalActivityCleanupHandlers(): void {
    ipcMain.handle('deleteLocalActivityForTimeEntries', async (_event, timeEntryIds: string[]) => {
        try {
            if (!timeEntryIds?.length) {
                return { success: true as const }
            }
            const ids = [...new Set(timeEntryIds.filter((id) => typeof id === 'string' && id.length > 0))]
            if (!ids.length) {
                return { success: true as const }
            }
            await db.delete(activitySamples).where(inArray(activitySamples.timeEntryId, ids))
            await db.delete(windowActivities).where(inArray(windowActivities.timeEntryId, ids))
            return { success: true as const }
        } catch (error) {
            console.error('deleteLocalActivityForTimeEntries failed:', error)
            return {
                success: false as const,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    })
}
