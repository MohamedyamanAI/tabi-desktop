import { apiClient } from './api'
import type { ActivitySampleRow } from '../../../preload/interface'

const LOG_PREFIX = '[Activity API]'
const ACTIVITY_SAMPLES_CHUNK_SIZE = 1000

function isNonRetryableUploadStatus(status: number | undefined): boolean {
    return status === 403 || status === 422
}

function logActivitySamplesOutgoing(
    organizationId: string,
    body: { time_entry_id: string; samples: { timestamp: string; keystrokes: number; mouse_clicks: number }[] }
): void {
    if (!import.meta.env.DEV) return
    console.log(
        `${LOG_PREFIX} POST /v1/organizations/${organizationId}/activity-samples`,
        JSON.stringify(body, null, 2)
    )
}

/**
 * POST unsynced local activity samples for a time entry. Marks rows synced on success.
 * Leaves rows unsynced on failure or non-retryable HTTP status.
 */
export async function uploadActivitySamplesForTimeEntry(
    organizationId: string,
    timeEntryId: string,
    timeEntryStartUtc?: string | null
): Promise<void> {
    const rows: ActivitySampleRow[] =
        await window.electronAPI.getUnsyncedActivitySamplesForTimeEntry(
            timeEntryId,
            timeEntryStartUtc ?? undefined
        )
    if (rows.length === 0) return

    for (let i = 0; i < rows.length; i += ACTIVITY_SAMPLES_CHUNK_SIZE) {
        const chunkRows = rows.slice(i, i + ACTIVITY_SAMPLES_CHUNK_SIZE)
        const samples = chunkRows.map((r) => ({
            timestamp: r.timestamp,
            keystrokes: r.keystrokes,
            mouse_clicks: r.mouseClicks,
        }))

        const body = {
            time_entry_id: timeEntryId,
            samples,
        }
        logActivitySamplesOutgoing(organizationId, body)

        try {
            await apiClient.value.axios.post(
                `/v1/organizations/${organizationId}/activity-samples`,
                body
            )
            if (import.meta.env.DEV) {
                console.log(
                    `${LOG_PREFIX} activity-samples OK`,
                    `synced chunk ${String(i / ACTIVITY_SAMPLES_CHUNK_SIZE + 1)} (${String(samples.length)} minute(s)) for time_entry_id=${timeEntryId}`
                )
            }
            await window.electronAPI.markActivitySamplesSynced(
                chunkRows.map((r) => r.id),
                timeEntryId
            )
        } catch (err: unknown) {
            const ax = err as { response?: { status: number; data?: unknown } }
            const status = ax.response?.status
            if (import.meta.env.DEV) {
                console.warn(
                    `${LOG_PREFIX} activity-samples request failed`,
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
