<script setup lang="ts">
import { PrimaryButton, SecondaryButton, Checkbox, LoadingSpinner, Modal } from '@solidtime/ui'
import { logout } from '../utils/oauth.ts'
import { isWidgetActivated, isTrayTimerActivated } from '../utils/settings.ts'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { getMe } from '../utils/me'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const queryClient = useQueryClient()
const organization = inject<
    ComputedRef<
        | {
              screenshots_enabled: boolean
              screenshot_interval_minutes: number
              screenshots_blurred: boolean
              idle_detection_enabled: boolean
              idle_threshold_minutes: number
              activity_tracking_enabled?: boolean
              app_activity_sync_enabled?: boolean
          }
        | undefined
    >
>('organization')
const organizationCapabilities = inject<
    ComputedRef<
        | {
              hasScreenshotEntitlement: boolean
              isOrgBlocked: boolean
              canUseScreenshots: boolean
          }
        | undefined
    >
>('organizationCapabilities')

const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
})

const showUpdateNotAvailable = ref(false)
const checkingForUpdate = ref(false)
const showErrorOnUpdateRequest = ref(false)
const showManualInstructionsModal = ref(false)
const hasPermission = ref(false)
const hasAccessibilityTrusted = ref(false)
const showDeleteWindowActivitiesModal = ref(false)
const showDeleteActivityPeriodsModal = ref(false)
const showDeleteActivitySamplesModal = ref(false)
const showDeleteIconCacheModal = ref(false)
const isDeletingWindowActivities = ref(false)
const isDeletingActivityPeriods = ref(false)
const isDeletingActivitySamples = ref(false)
const isDeletingIconCache = ref(false)
const pendingScreenshots = ref(0)
const myData = computed(() => data.value?.data)
const hasScreenshotEntitlement = computed(
    () => organizationCapabilities?.value?.hasScreenshotEntitlement ?? false
)
const canUseScreenshots = computed(
    () => organizationCapabilities?.value?.canUseScreenshots ?? false
)
const isScreenshotBlockedByOrg = computed(
    () =>
        hasScreenshotEntitlement.value &&
        !canUseScreenshots.value &&
        organizationCapabilities?.value?.isOrgBlocked
)

const orgActivityLevelOn = computed(() => Boolean(organization?.value?.activity_tracking_enabled))
const orgAppActivitySyncOn = computed(() => Boolean(organization?.value?.app_activity_sync_enabled))

const liveActivityBucket = ref<{ timestamp: string; keystrokes: number; mouse_clicks: number } | null>(
    null
)
let liveBucketPoll: ReturnType<typeof setInterval> | null = null

function startLiveBucketPoll() {
    if (liveBucketPoll !== null) return
    const tick = async () => {
        if (!orgActivityLevelOn.value) {
            liveActivityBucket.value = null
            return
        }
        try {
            liveActivityBucket.value = await window.electronAPI.getCurrentActivityBucket()
        } catch {
            liveActivityBucket.value = null
        }
    }
    void tick()
    liveBucketPoll = setInterval(() => void tick(), 1000)
}

function stopLiveBucketPoll() {
    if (liveBucketPoll !== null) {
        clearInterval(liveBucketPoll)
        liveBucketPoll = null
    }
    liveActivityBucket.value = null
}

watch(
    orgActivityLevelOn,
    (on) => {
        if (on) {
            startLiveBucketPoll()
        } else {
            stopLiveBucketPoll()
        }
    },
    { immediate: true }
)

function onAppWindowFocus() {
    void refreshLocalPermissionState()
}

onUnmounted(() => {
    stopLiveBucketPoll()
    window.removeEventListener('focus', onAppWindowFocus)
})

const isMac = computed(
    () => typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
)

function onLogoutClick() {
    logout(queryClient)
    router.push('/time')
}

function triggerUpdate() {
    checkingForUpdate.value = true
    window.electronAPI.updateAutoUpdater()
}

async function requestScreenRecording() {
    const granted = await window.electronAPI.requestScreenRecordingPermission()
    hasPermission.value = granted || (await window.electronAPI.checkScreenRecordingPermission())
    if (!hasPermission.value) {
        showManualInstructionsModal.value = true
    }
}

async function requestAccessibility() {
    await window.electronAPI.promptAccessibilityTrusted()
    hasAccessibilityTrusted.value = await window.electronAPI.checkAccessibilityTrusted()
}

function closeManualInstructions() {
    showManualInstructionsModal.value = false
}

async function confirmDeleteWindowActivities() {
    isDeletingWindowActivities.value = true
    try {
        const result = await window.electronAPI.deleteAllWindowActivities()
        if (result.success) {
            console.log('Window activities deleted successfully')
        } else {
            console.error('Failed to delete window activities:', result.error)
        }
    } catch (error) {
        console.error('Error deleting window activities:', error)
    } finally {
        isDeletingWindowActivities.value = false
        showDeleteWindowActivitiesModal.value = false
    }
}

async function confirmDeleteActivityPeriods() {
    isDeletingActivityPeriods.value = true
    try {
        const result = await window.electronAPI.deleteAllActivityPeriods()
        if (result.success) {
            console.log('Activity periods deleted successfully')
        } else {
            console.error('Failed to delete activity periods:', result.error)
        }
    } catch (error) {
        console.error('Error deleting activity periods:', error)
    } finally {
        isDeletingActivityPeriods.value = false
        showDeleteActivityPeriodsModal.value = false
    }
}

async function confirmDeleteActivitySamples() {
    isDeletingActivitySamples.value = true
    try {
        const result = await window.electronAPI.deleteAllActivitySamples()
        if (result.success) {
            console.log('Activity samples deleted successfully')
        } else {
            console.error('Failed to delete activity samples:', result.error)
        }
    } catch (error) {
        console.error('Error deleting activity samples:', error)
    } finally {
        isDeletingActivitySamples.value = false
        showDeleteActivitySamplesModal.value = false
    }
}

async function confirmDeleteIconCache() {
    isDeletingIconCache.value = true
    try {
        const result = await window.electronAPI.clearIconCache()
        if (result.success) {
            console.log('Icon cache cleared successfully')
        } else {
            console.error('Failed to clear icon cache')
        }
    } catch (error) {
        console.error('Error clearing icon cache:', error)
    } finally {
        isDeletingIconCache.value = false
        showDeleteIconCacheModal.value = false
    }
}

async function refreshLocalPermissionState() {
    if (orgActivityLevelOn.value || organizationCapabilities?.value?.canUseScreenshots) {
        hasPermission.value = await window.electronAPI.checkScreenRecordingPermission()
    }
    if (orgActivityLevelOn.value) {
        hasAccessibilityTrusted.value = await window.electronAPI.checkAccessibilityTrusted()
    }
}

watch(
    () => organization?.value,
    () => {
        void refreshLocalPermissionState()
    },
    { immediate: true }
)

onMounted(async () => {
    window.addEventListener('focus', onAppWindowFocus)
    void refreshLocalPermissionState()

    // Fetch pending screenshot count
    try {
        pendingScreenshots.value = await window.electronAPI.getScreenshotPendingCount()
    } catch {
        // Ignore errors
    }

    window.electronAPI.onUpdateNotAvailable(() => {
        showUpdateNotAvailable.value = true
        checkingForUpdate.value = false
        setTimeout(() => {
            showUpdateNotAvailable.value = false
        }, 5000)
    })
    window.electronAPI.onAutoUpdaterError(async () => {
        showUpdateNotAvailable.value = true
        showErrorOnUpdateRequest.value = true
        checkingForUpdate.value = false
        setTimeout(() => {
            showUpdateNotAvailable.value = false
            showErrorOnUpdateRequest.value = false
        }, 5000)
    })
})
</script>

<template>
    <div class="flex-1 overflow-auto">
        <div class="max-w-4xl mx-auto p-8">
            <h1 class="text-2xl font-semibold mb-8">Settings</h1>

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
                <div class="mb-4 text-lg font-medium">User Information</div>
                <div v-if="myData" class="flex justify-between items-center">
                    <div class="flex items-center space-x-4">
                        <img
                            :src="myData.profile_photo_url"
                            class="rounded-full w-14 h-14 object-cover"
                            alt="Profile image" />
                        <div>
                            <div class="text-sm text-muted py-0.5">
                                <strong>Name:</strong> {{ myData.name }}
                            </div>
                            <div class="text-sm text-muted py-0.5">
                                <strong>Email:</strong> {{ myData.email }}
                            </div>
                        </div>
                    </div>
                    <PrimaryButton @click="onLogoutClick">Logout</PrimaryButton>
                </div>
            </div>

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
                <div class="mb-4 text-lg font-medium">Preferences</div>
                <div class="space-y-4">
                    <label class="flex items-center">
                        <Checkbox v-model:checked="isWidgetActivated" name="remember" />
                        <span class="ms-2 text-sm">Show Timetracker Widget</span>
                    </label>
                    <label class="flex items-center">
                        <Checkbox v-model:checked="isTrayTimerActivated" name="tray_timer" />
                        <span class="ms-2 text-sm">Show Tray / Menu Bar Timer</span>
                    </label>
                </div>
            </div>

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
                <div class="mb-4 text-lg font-medium">Activity tracking</div>
                <div v-if="!organization" class="text-xs text-muted">
                    Loading organization settings...
                </div>
                <div v-else class="space-y-4">
                    <div class="flex items-center space-x-2">
                        <div
                            class="w-2 h-2 rounded-full"
                            :class="orgActivityLevelOn ? 'bg-green-500' : 'bg-gray-400'"></div>
                        <span class="text-sm">
                            Activity level tracking is
                            <strong>{{ orgActivityLevelOn ? 'on' : 'off' }}</strong>
                            for your organization.
                        </span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <div
                            class="w-2 h-2 rounded-full"
                            :class="orgAppActivitySyncOn ? 'bg-green-500' : 'bg-gray-400'"></div>
                        <span class="text-sm">
                            App activity sync is
                            <strong>{{ orgAppActivitySyncOn ? 'on' : 'off' }}</strong>
                            for your organization.
                        </span>
                    </div>
                    <p class="text-xs text-muted">
                        These options are managed by your organization.
                    </p>
                    <p
                        v-if="orgActivityLevelOn && liveActivityBucket"
                        class="text-xs text-text-secondary font-mono tabular-nums">
                        This minute (UTC {{ liveActivityBucket.timestamp }}): {{ liveActivityBucket.keystrokes }}
                        keystrokes, {{ liveActivityBucket.mouse_clicks }} clicks
                    </p>
                    <div
                        v-if="orgActivityLevelOn"
                        class="ml-1 space-y-3 border-l border-card-background-separator pl-4">
                        <p class="text-xs text-muted">
                            Window titles use Screen Recording on macOS. Keyboard and mouse activity
                            counts may require Accessibility (and Input Monitoring on some macOS
                            versions).
                        </p>
                        <div v-if="!hasPermission" class="flex flex-wrap gap-2 items-center">
                            <p class="text-xs text-yellow-600 w-full">
                                Screen Recording is not granted; window titles may be missing.
                            </p>
                            <SecondaryButton
                                class="text-xs py-1 px-2"
                                @click="requestScreenRecording">
                                Open screen recording prompt
                            </SecondaryButton>
                            <SecondaryButton
                                class="text-xs py-1 px-2"
                                @click="showManualInstructionsModal = true">
                                Manual steps
                            </SecondaryButton>
                        </div>
                        <div
                            v-if="isMac && !hasAccessibilityTrusted"
                            class="flex flex-wrap gap-2 items-center">
                            <p class="text-xs text-yellow-600 w-full">
                                Accessibility is not trusted; activity level counts may stay at
                                zero.
                            </p>
                            <SecondaryButton
                                class="text-xs py-1 px-2"
                                @click="requestAccessibility">
                                Open Accessibility settings
                            </SecondaryButton>
                        </div>
                    </div>
                </div>
            </div>

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
                <div class="mb-4 text-lg font-medium">Screenshots</div>
                <div class="space-y-4">
                    <div v-if="!organization" class="text-xs text-muted">
                        Loading organization settings...
                    </div>
                    <div v-else-if="!hasScreenshotEntitlement" class="text-xs text-muted">
                        Screenshots are not included in your current organization plan.
                    </div>
                    <div v-else class="space-y-4">
                        <div class="flex items-center space-x-2">
                            <div
                                class="w-2 h-2 rounded-full"
                                :class="canUseScreenshots ? 'bg-green-500' : 'bg-gray-400'"></div>
                            <span class="text-sm">
                                Screenshot capture is
                                <strong>{{ canUseScreenshots ? 'enabled' : 'disabled' }}</strong>
                                by your organization.
                            </span>
                        </div>
                        <div v-if="isScreenshotBlockedByOrg" class="ml-4 text-xs text-yellow-600">
                            Screenshots are temporarily unavailable because this organization is
                            blocked.
                        </div>
                        <div v-else-if="!canUseScreenshots" class="ml-4 text-xs text-muted">
                            Screenshots are disabled by your organization settings.
                        </div>
                        <div v-if="canUseScreenshots" class="ml-4 space-y-3">
                            <div class="text-xs text-muted">
                                {{
                                    organization?.screenshots_blurred !== false
                                        ? 'Blurred screenshots are'
                                        : 'Clear screenshots are'
                                }}
                                captured at random intervals while a timer is running and uploaded
                                to your organization's server.
                            </div>
                            <div class="text-sm">
                                Capture interval:
                                <strong
                                    >{{ organization.screenshot_interval_minutes }} minutes</strong
                                >
                            </div>
                            <div v-if="pendingScreenshots > 0" class="text-xs text-yellow-600">
                                {{ pendingScreenshots }} screenshot(s) pending upload
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
                <div class="mb-4 text-lg font-medium">Idle Detection</div>
                <div class="space-y-4">
                    <div class="flex items-center space-x-2">
                        <div
                            class="w-2 h-2 rounded-full"
                            :class="
                                organization?.idle_detection_enabled
                                    ? 'bg-green-500'
                                    : 'bg-gray-400'
                            "></div>
                        <span class="text-sm">
                            Idle detection is
                            <strong>{{
                                organization?.idle_detection_enabled ? 'enabled' : 'disabled'
                            }}</strong>
                            by your organization.
                        </span>
                    </div>
                    <div v-if="organization?.idle_detection_enabled" class="ml-4 space-y-3">
                        <div class="text-xs text-muted">
                            You will be prompted when returning from inactivity while a timer is
                            running.
                        </div>
                        <div class="text-sm">
                            Idle threshold:
                            <strong>{{ organization.idle_threshold_minutes }} minutes</strong>
                        </div>
                    </div>
                    <div v-if="!organization" class="text-xs text-muted">
                        Loading organization settings...
                    </div>
                </div>
            </div>

            <div
                class="bg-card-background rounded-lg border border-card-background-separator p-6 mb-6">
                <div class="mb-4 text-lg font-medium">Updates</div>
                <div class="flex items-center space-x-4">
                    <SecondaryButton :disabled="checkingForUpdate" @click="triggerUpdate">
                        <div class="flex items-center">
                            <LoadingSpinner v-if="checkingForUpdate"></LoadingSpinner>
                            <span>Check for updates</span>
                        </div>
                    </SecondaryButton>
                    <div v-if="showUpdateNotAvailable" class="flex text-sm text-text-primary">
                        No update available.
                        <span v-if="showErrorOnUpdateRequest"
                            >There was an error while fetching the update.</span
                        >
                    </div>
                </div>
            </div>

            <div class="bg-card-background rounded-lg border border-card-background-separator p-6">
                <div class="mb-4 text-lg font-medium">Data Management</div>
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Window Activities</div>
                            <div class="text-xs text-muted">
                                Delete all tracked window activities and application usage data
                            </div>
                        </div>
                        <SecondaryButton
                            class="text-red-500 hover:text-red-600"
                            @click="showDeleteWindowActivitiesModal = true">
                            Delete All
                        </SecondaryButton>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Activity Periods</div>
                            <div class="text-xs text-muted">
                                Delete all idle and active period records
                            </div>
                        </div>
                        <SecondaryButton
                            class="text-red-500 hover:text-red-600"
                            @click="showDeleteActivityPeriodsModal = true">
                            Delete All
                        </SecondaryButton>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Activity samples</div>
                            <div class="text-xs text-muted">
                                Delete local keyboard/mouse minute buckets (not yet synced)
                            </div>
                        </div>
                        <SecondaryButton
                            class="text-red-500 hover:text-red-600"
                            @click="showDeleteActivitySamplesModal = true">
                            Delete All
                        </SecondaryButton>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-sm font-medium">Icon Cache</div>
                            <div class="text-xs text-muted">Clear cached application icons</div>
                        </div>
                        <SecondaryButton
                            class="text-red-500 hover:text-red-600"
                            @click="showDeleteIconCacheModal = true">
                            Clear Cache
                        </SecondaryButton>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Manual Permission Instructions Modal -->
    <Modal
        :show="showManualInstructionsModal"
        :maxWidth="'2xl'"
        :closeable="true"
        @close="closeManualInstructions">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Manually Grant Screen Recording Permission
            </div>

            <div class="text-sm text-muted space-y-4">
                <p>
                    If you do not get a permission popup you can manually grant screen recording
                    permission in macOS System Settings.
                </p>

                <div class="border border-border-secondary p-3 rounded-lg space-y-3">
                    <ol class="list-decimal list-inside space-y-2 text-xs">
                        <li>
                            Open <strong>System Settings</strong> (or System Preferences on older
                            macOS versions)
                        </li>
                        <li>Navigate to <strong>Privacy & Security</strong></li>
                        <li>Select <strong>Screen Recording</strong> from the list on the left</li>
                        <li>
                            Find <strong>Tabi</strong> in the application list (or add it via the +
                            button at the bottom)
                        </li>
                        <li>
                            Toggle the switch to enable screen recording for
                            <strong>Tabi</strong>
                        </li>
                        <li>You may need to restart the application for changes to take effect</li>
                    </ol>
                </div>

                <p class="text-xs">
                    After granting permission in System Settings, activity tracking will capture
                    window titles for improved accuracy.
                </p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <PrimaryButton @click="closeManualInstructions">Got It</PrimaryButton>
        </div>
    </Modal>

    <!-- Delete Window Activities Confirmation Modal -->
    <Modal
        :show="showDeleteWindowActivitiesModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingWindowActivities"
        @close="showDeleteWindowActivitiesModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Delete Window Activities
            </div>

            <div class="text-sm text-muted space-y-3">
                <p>
                    Are you sure you want to delete all window activities? This will permanently
                    remove all tracked application usage and window title data.
                </p>
                <p class="text-red-500 font-medium">This action cannot be undone.</p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                :disabled="isDeletingWindowActivities"
                @click="showDeleteWindowActivitiesModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                :disabled="isDeletingWindowActivities"
                class="bg-red-600 hover:bg-red-700"
                @click="confirmDeleteWindowActivities">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingWindowActivities"></LoadingSpinner>
                    <span>{{ isDeletingWindowActivities ? 'Deleting...' : 'Delete All' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>

    <!-- Delete Activity Samples Confirmation Modal -->
    <Modal
        :show="showDeleteActivitySamplesModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingActivitySamples"
        @close="showDeleteActivitySamplesModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Delete activity samples
            </div>

            <div class="text-sm text-muted space-y-3">
                <p>
                    Delete all locally stored activity level samples (per-minute keyboard and mouse
                    counts)? Unsynced data will be removed from this device.
                </p>
                <p class="text-red-500 font-medium">This action cannot be undone.</p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                :disabled="isDeletingActivitySamples"
                @click="showDeleteActivitySamplesModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                :disabled="isDeletingActivitySamples"
                class="bg-red-600 hover:bg-red-700"
                @click="confirmDeleteActivitySamples">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingActivitySamples"></LoadingSpinner>
                    <span>{{ isDeletingActivitySamples ? 'Deleting...' : 'Delete All' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>

    <!-- Delete Activity Periods Confirmation Modal -->
    <Modal
        :show="showDeleteActivityPeriodsModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingActivityPeriods"
        @close="showDeleteActivityPeriodsModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">
                Delete Activity Periods
            </div>

            <div class="text-sm text-muted space-y-3">
                <p>
                    Are you sure you want to delete all activity periods? This will permanently
                    remove all idle and active period records.
                </p>
                <p class="text-red-500 font-medium">This action cannot be undone.</p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                :disabled="isDeletingActivityPeriods"
                @click="showDeleteActivityPeriodsModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton
                :disabled="isDeletingActivityPeriods"
                class="bg-red-600 hover:bg-red-700"
                @click="confirmDeleteActivityPeriods">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingActivityPeriods"></LoadingSpinner>
                    <span>{{ isDeletingActivityPeriods ? 'Deleting...' : 'Delete All' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>

    <!-- Clear Icon Cache Confirmation Modal -->
    <Modal
        :show="showDeleteIconCacheModal"
        :maxWidth="'2xl'"
        :closeable="!isDeletingIconCache"
        @close="showDeleteIconCacheModal = false">
        <div class="px-6 py-4">
            <div class="text-lg font-medium text-white mb-4" role="heading">Clear Icon Cache</div>

            <div class="text-sm text-muted space-y-3">
                <p>
                    Are you sure you want to clear the icon cache? This will remove all cached
                    application icons. They will be re-downloaded when needed.
                </p>
                <p class="text-xs text-muted">
                    Note: This is a safe operation and will not delete any activity data.
                </p>
            </div>
        </div>

        <div
            class="flex flex-row justify-end px-6 py-4 border-t space-x-2 border-card-background-separator bg-default-background rounded-b-2xl text-end">
            <SecondaryButton
                :disabled="isDeletingIconCache"
                @click="showDeleteIconCacheModal = false"
                >Cancel</SecondaryButton
            >
            <PrimaryButton :disabled="isDeletingIconCache" @click="confirmDeleteIconCache">
                <div class="flex items-center">
                    <LoadingSpinner v-if="isDeletingIconCache"></LoadingSpinner>
                    <span>{{ isDeletingIconCache ? 'Clearing...' : 'Clear Cache' }}</span>
                </div>
            </PrimaryButton>
        </div>
    </Modal>
</template>
