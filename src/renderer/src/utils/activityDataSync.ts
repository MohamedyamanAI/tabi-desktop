import { watch, type ComputedRef, type Ref } from 'vue'
import type { TimeEntry } from '@solidtime/api'
import { orgActivityTrackingEnabled } from './orgActivityContext'
import { syncActivityDataForTimeEntry } from './activityDataCoordinator'

const LOG_PREFIX = '[Activity API]'

/** Standalone interval for unsynced activity samples + app activities (timer on or off). */
const ACTIVITY_DATA_SYNC_INTERVAL_MS = 2 * 60 * 1000

function shouldRunPeriodicSync(
    isActive: boolean,
    orgActivityOn: boolean,
    currentTeId: string,
    lastTeId: string,
    lastTeOrgId: string,
    currentOrgId: string | null
): boolean {
    if (!orgActivityOn) return false
    if (isActive && currentTeId) return true
    if (!isActive && lastTeId && lastTeOrgId && currentOrgId && lastTeOrgId === currentOrgId) {
        return true
    }
    return false
}

/**
 * Periodic sync while org activity tracking is on: uses the running time entry when the timer is
 * active, otherwise the most recent time entry for the current org so data recorded with no timer
 * still uploads. Screenshot upload also triggers sync for the active time entry.
 */
export function initializeActivityDataSync(
    isActive: ComputedRef<boolean>,
    currentTimeEntry: Ref<TimeEntry>,
    lastTimeEntry: Ref<TimeEntry>,
    currentOrganizationId: ComputedRef<string | null>
): void {
    let interval: ReturnType<typeof setInterval> | null = null

    function clear(): void {
        if (interval) {
            clearInterval(interval)
            interval = null
        }
    }

    function tick(): void {
        if (!orgActivityTrackingEnabled.value) {
            if (import.meta.env.DEV) {
                console.log(
                    `${LOG_PREFIX} periodic sync skipped: org has activity level tracking off`
                )
            }
            return
        }

        if (isActive.value) {
            const orgId = currentTimeEntry.value.organization_id
            const teId = currentTimeEntry.value.id
            const start = currentTimeEntry.value.start

            if (!orgId || !teId) {
                if (import.meta.env.DEV) {
                    console.log(
                        `${LOG_PREFIX} periodic sync skipped: timer running but time entry id not ready yet`
                    )
                }
                return
            }
            if (
                currentOrganizationId.value &&
                orgId !== currentOrganizationId.value
            ) {
                return
            }

            void syncActivityDataForTimeEntry(orgId, teId, start || undefined).catch((e) =>
                console.error('Periodic activity data sync failed:', e)
            )
            return
        }

        const last = lastTimeEntry.value
        const orgId = last.organization_id
        const teId = last.id
        const start = last.start

        if (!orgId || !teId) {
            if (import.meta.env.DEV) {
                console.log(
                    `${LOG_PREFIX} periodic sync skipped (timer off): no last time entry to attach orphan activity to`
                )
            }
            return
        }
        if (!currentOrganizationId.value || orgId !== currentOrganizationId.value) {
            if (import.meta.env.DEV) {
                console.log(
                    `${LOG_PREFIX} periodic sync skipped (timer off): last time entry is not in the current organization`
                )
            }
            return
        }

        void syncActivityDataForTimeEntry(orgId, teId, start || undefined).catch((e) =>
            console.error('Periodic activity data sync failed:', e)
        )
    }

    watch(
        [
            isActive,
            orgActivityTrackingEnabled,
            () => currentTimeEntry.value.id,
            () => lastTimeEntry.value.id,
            () => lastTimeEntry.value.organization_id,
            currentOrganizationId,
        ],
        () => {
            clear()
            const orgOn = orgActivityTrackingEnabled.value
            const curId = currentTimeEntry.value.id
            const lastId = lastTimeEntry.value.id
            const lastOrg = lastTimeEntry.value.organization_id
            const curOrg = currentOrganizationId.value
            if (
                !shouldRunPeriodicSync(
                    isActive.value,
                    orgOn,
                    curId,
                    lastId,
                    lastOrg,
                    curOrg
                )
            ) {
                return
            }
            interval = setInterval(tick, ACTIVITY_DATA_SYNC_INTERVAL_MS)
            void tick()
        },
        { immediate: true }
    )
}
