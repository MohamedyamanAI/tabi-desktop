import { orgActivityTrackingEnabled, orgAppActivitySyncEnabled } from './orgActivityContext'
import { uploadActivitySamplesForTimeEntry } from './activitySampleUpload'
import { uploadAppActivitiesForTimeEntry } from './appActivityUpload'

/**
 * Upload activity samples and (when org allows) app activities for the given time entry.
 */
export async function syncActivityDataForTimeEntry(
    organizationId: string,
    timeEntryId: string,
    timeEntryStartUtc?: string | null
): Promise<void> {
    if (!orgActivityTrackingEnabled.value) return

    await uploadActivitySamplesForTimeEntry(organizationId, timeEntryId, timeEntryStartUtc)

    if (orgAppActivitySyncEnabled.value) {
        await uploadAppActivitiesForTimeEntry(organizationId, timeEntryId, timeEntryStartUtc)
    }
}
