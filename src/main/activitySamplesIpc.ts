import { ipcMain } from 'electron'
import { db } from './db/client'
import { activitySamples } from './db/schema'
import { getCurrentActivityBucket } from './inputTracker'
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'

export function registerActivitySamplesHandlers(): void {
    ipcMain.handle('getCurrentActivityBucket', () => {
        return getCurrentActivityBucket()
    })

    ipcMain.handle('getActivitySamples', async (_event, startDate: string, endDate: string) => {
        try {
            return await db
                .select()
                .from(activitySamples)
                .where(
                    and(
                        gte(activitySamples.timestamp, startDate),
                        lte(activitySamples.timestamp, endDate)
                    )
                )
                .orderBy(activitySamples.timestamp)
        } catch (error) {
            console.error('getActivitySamples failed:', error)
            return []
        }
    })

    ipcMain.handle('deleteAllActivitySamples', async () => {
        try {
            await db.delete(activitySamples)
            return { success: true }
        } catch (error) {
            console.error('deleteAllActivitySamples failed:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    })

    ipcMain.handle(
        'getUnsyncedActivitySamplesForTimeEntry',
        async (_event, timeEntryId: string, _timeEntryStartUtc?: string | null) => {
            try {
                if (!timeEntryId) return []

                // Rows for this time entry plus any unsynced orphans (recorded while timer was off).
                // They are POSTed with this time_entry_id so the server can store them.
                return await db
                    .select()
                    .from(activitySamples)
                    .where(
                        and(
                            eq(activitySamples.synced, false),
                            or(
                                eq(activitySamples.timeEntryId, timeEntryId),
                                isNull(activitySamples.timeEntryId)
                            )
                        )
                    )
                    .orderBy(activitySamples.timestamp)
            } catch (error) {
                console.error('getUnsyncedActivitySamplesForTimeEntry failed:', error)
                return []
            }
        }
    )

    ipcMain.handle(
        'markActivitySamplesSynced',
        async (_event, ids: number[], timeEntryIdForAssign?: string | null) => {
            try {
                if (ids.length === 0) return { success: true }
                const patch: { synced: boolean; timeEntryId?: string } = { synced: true }
                if (timeEntryIdForAssign) {
                    patch.timeEntryId = timeEntryIdForAssign
                }
                await db.update(activitySamples).set(patch).where(inArray(activitySamples.id, ids))
                return { success: true }
            } catch (error) {
                console.error('markActivitySamplesSynced failed:', error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                }
            }
        }
    )
}
