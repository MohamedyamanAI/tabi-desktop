import { apiClient } from './api'
import { useStorage } from '@vueuse/core'
import { emptyTimeEntry } from './timeEntries'
import type { TimeEntry } from '@solidtime/api'
import { syncActivityDataForTimeEntry } from './activityDataCoordinator'

let cleanupListener: (() => void) | null = null

/**
 * Initialize the screenshot upload handler.
 * Listens for screenshotCaptured events from the main process and uploads them.
 */
export function initializeScreenshotUpload(): void {
    if (cleanupListener) return

    console.log('Screenshot upload handler: registering listener')

    cleanupListener = window.electronAPI.onScreenshotCaptured(async (data) => {
        const { filePath, timeEntryId, capturedAt, base64 } = data

        console.log(
            `Screenshot received in renderer: timeEntryId=${timeEntryId}, capturedAt=${capturedAt}, base64Length=${base64?.length}`
        )

        try {
            // Get current time entry and organization from localStorage
            const currentTimeEntry = useStorage<TimeEntry>('currentTimeEntry', {
                ...emptyTimeEntry,
            })
            const organizationId = currentTimeEntry.value.organization_id

            if (!organizationId) {
                console.error('No organization ID available for screenshot upload')
                window.electronAPI.sendScreenshotUploadResult(filePath, false)
                return
            }

            // Use the time entry ID from the event, or fall back to current entry
            const entryId = timeEntryId || currentTimeEntry.value.id
            if (!entryId) {
                console.error('No time entry ID available for screenshot upload')
                window.electronAPI.sendScreenshotUploadResult(filePath, false)
                return
            }

            // Convert base64 to blob
            const byteString = atob(base64)
            const ab = new ArrayBuffer(byteString.length)
            const ia = new Uint8Array(ab)
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i)
            }
            const blob = new Blob([ab], { type: 'image/webp' })
            const file = new File([blob], 'screenshot.webp', { type: 'image/webp' })

            // Upload via multipart form data
            const formData = new FormData()
            formData.append('screenshot', file)
            formData.append('time_entry_id', entryId)
            formData.append('captured_at', capturedAt)

            await apiClient.value.axios.post(
                `/v1/organizations/${organizationId}/screenshots`,
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            )

            console.log('Screenshot uploaded successfully')
            // Extra flush of activity/app data after screenshot (primary sync is timer-driven in activityDataSync)
            void syncActivityDataForTimeEntry(
                organizationId,
                entryId,
                currentTimeEntry.value.start || undefined
            ).catch((e) => console.error('Activity data sync after screenshot failed:', e))
            window.electronAPI.sendScreenshotUploadResult(filePath, true)
        } catch (error: unknown) {
            const axiosError = error as {
                response?: { status: number; data: unknown }
                message?: string
            }
            const details = axiosError?.response
                ? `HTTP ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data)}`
                : axiosError?.message || String(error)
            console.error('Failed to upload screenshot:', details)
            window.electronAPI.sendScreenshotUploadResult(filePath, false)
        }
    })
}

/**
 * Clean up the screenshot upload listener
 */
export function stopScreenshotUpload(): void {
    if (cleanupListener) {
        cleanupListener()
        cleanupListener = null
    }
}
