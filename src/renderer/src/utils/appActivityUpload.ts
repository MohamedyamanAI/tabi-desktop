import { apiClient } from './api'
import type { WindowActivity } from '../../../preload/interface'

const LOG_PREFIX = '[Activity API]'
const APP_ACTIVITIES_CHUNK_SIZE = 300

function isNonRetryableUploadStatus(status: number | undefined): boolean {
    return status === 403 || status === 422
}

function logAppActivitiesOutgoing(
    organizationId: string,
    body: {
        time_entry_id: string
        activities: {
            timestamp: string
            app_name: string
            window_title: string
            url?: string
            duration_seconds: number
        }[]
    }
): void {
    if (!import.meta.env.DEV) return
    console.log(
        `${LOG_PREFIX} POST /v1/organizations/${organizationId}/app-activities`,
        JSON.stringify(body, null, 2)
    )
}

/**
 * POST unsynced local window activities for a time entry. Marks rows synced on success.
 */
export async function uploadAppActivitiesForTimeEntry(
    organizationId: string,
    timeEntryId: string,
    timeEntryStartUtc?: string | null
): Promise<void> {
    const rows: WindowActivity[] =
        await window.electronAPI.getUnsyncedWindowActivitiesForTimeEntry(
            timeEntryId,
            timeEntryStartUtc
        )
    if (rows.length === 0) return

    for (let i = 0; i < rows.length; i += APP_ACTIVITIES_CHUNK_SIZE) {
        const chunkRows = rows.slice(i, i + APP_ACTIVITIES_CHUNK_SIZE)
        const activities = chunkRows.map((r) => ({
            timestamp: r.timestamp,
            app_name: r.appName,
            window_title: r.windowTitle,
            url: r.url ?? undefined,
            duration_seconds: r.durationSeconds,
        }))

        const body = {
            time_entry_id: timeEntryId,
            activities,
        }
        logAppActivitiesOutgoing(organizationId, body)

        try {
            await apiClient.value.axios.post(`/v1/organizations/${organizationId}/app-activities`, body)
            if (import.meta.env.DEV) {
                console.log(
                    `${LOG_PREFIX} app-activities OK`,
                    `synced chunk ${String(i / APP_ACTIVITIES_CHUNK_SIZE + 1)} (${String(activities.length)} row(s)) for time_entry_id=${timeEntryId}`
                )
            }
            await window.electronAPI.markWindowActivitiesSynced(
                chunkRows.map((r) => r.id),
                timeEntryId
            )
        } catch (err: unknown) {
            const ax = err as { response?: { status: number; data?: unknown } }
            const status = ax.response?.status
            if (import.meta.env.DEV) {
                console.warn(
                    `${LOG_PREFIX} app-activities request failed`,
                    status != null ? `HTTP ${String(status)}` : err,
                    ax.response?.data
                )
            }
            if (isNonRetryableUploadStatus(status)) {
                return
            }
            throw err
        }
    }
}
