import { ref } from 'vue'

/** Mirrors org `activity_tracking_enabled` from API (set in App.vue). */
export const orgActivityTrackingEnabled = ref(false)

/** Mirrors org `app_activity_sync_enabled` from API (set in App.vue). */
export const orgAppActivitySyncEnabled = ref(false)
