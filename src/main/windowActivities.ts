import { ipcMain } from 'electron'
import { db } from './db/client'
import { windowActivities } from './db/schema'
import { and, eq, gte, inArray, lte, sql, ne, or, isNull } from 'drizzle-orm'

/** Same filter as getWindowActivityStats / getWindowActivities so local totals match synced data on the web. */
function windowActivityIncludedInStatistics() {
    return ne(windowActivities.appName, 'Unknown')
}

/**
 * Deletes all window activities from the database
 */
async function deleteAllWindowActivities(): Promise<{ success: boolean; error?: string }> {
    try {
        await db.delete(windowActivities)
        console.log('All window activities deleted successfully')
        return { success: true }
    } catch (error) {
        console.error('Failed to delete window activities:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        }
    }
}

/**
 * Registers IPC handlers for window activities
 */
export function registerWindowActivitiesHandlers() {
    // Get window activities for a date range
    ipcMain.handle('getWindowActivities', async (_event, startDate: string, endDate: string) => {
        try {
            const activities = await db
                .select()
                .from(windowActivities)
                .where(
                    and(
                        gte(windowActivities.timestamp, startDate),
                        lte(windowActivities.timestamp, endDate),
                        windowActivityIncludedInStatistics()
                    )
                )
                .orderBy(windowActivities.timestamp)

            return activities
        } catch (error) {
            console.error('Failed to get window activities:', error)
            return []
        }
    })

    // Get aggregated window activity statistics for a date range
    ipcMain.handle('getWindowActivityStats', async (_event, startDate: string, endDate: string) => {
        try {
            const stats = await db
                .select({
                    appName: windowActivities.appName,
                    url: windowActivities.url,
                    windowTitle: windowActivities.windowTitle,
                    count: sql<number>`SUM(${windowActivities.durationSeconds})`,
                })
                .from(windowActivities)
                .where(
                    and(
                        gte(windowActivities.timestamp, startDate),
                        lte(windowActivities.timestamp, endDate),
                        windowActivityIncludedInStatistics()
                    )
                )
                .groupBy(
                    windowActivities.appName,
                    windowActivities.url,
                    windowActivities.windowTitle
                )
                .orderBy(sql`SUM(${windowActivities.durationSeconds}) DESC`)

            return stats
        } catch (error) {
            console.error('Failed to get window activity stats:', error)
            return []
        }
    })

    // Delete all window activities
    ipcMain.handle('deleteAllWindowActivities', async () => {
        return deleteAllWindowActivities()
    })

    ipcMain.handle(
        'getUnsyncedWindowActivitiesForTimeEntry',
        async (_event, timeEntryId: string, _timeEntryStartUtc?: string | null) => {
            try {
                if (!timeEntryId) return []

                return await db
                    .select()
                    .from(windowActivities)
                    .where(
                        and(
                            eq(windowActivities.synced, false),
                            or(
                                eq(windowActivities.timeEntryId, timeEntryId),
                                isNull(windowActivities.timeEntryId)
                            ),
                            windowActivityIncludedInStatistics()
                        )
                    )
                    .orderBy(windowActivities.timestamp)
            } catch (error) {
                console.error('getUnsyncedWindowActivitiesForTimeEntry failed:', error)
                return []
            }
        }
    )

    ipcMain.handle(
        'markWindowActivitiesSynced',
        async (_event, ids: number[], timeEntryIdForAssign?: string | null) => {
            try {
                if (ids.length === 0) return { success: true }
                const patch: { synced: boolean; timeEntryId?: string } = { synced: true }
                if (timeEntryIdForAssign) {
                    patch.timeEntryId = timeEntryIdForAssign
                }
                await db.update(windowActivities).set(patch).where(inArray(windowActivities.id, ids))
                return { success: true }
            } catch (error) {
                console.error('markWindowActivitiesSynced failed:', error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                }
            }
        }
    )
}
