import { desktopCapturer, systemPreferences } from 'electron'

/**
 * Checks if the app has screen recording permission on macOS
 * On Windows and Linux, this will always return 'granted'
 */
export function getScreenRecordingPermissionStatus():
    | 'not-determined'
    | 'granted'
    | 'denied'
    | 'restricted'
    | 'unknown' {
    if (process.platform === 'darwin') {
        return systemPreferences.getMediaAccessStatus('screen')
    }
    // On Windows and Linux, screen recording doesn't require explicit permission
    return 'granted'
}

/**
 * Checks if screen recording permission is granted
 */
export function hasScreenRecordingPermission(): boolean {
    const status = getScreenRecordingPermissionStatus()
    return status === 'granted'
}

/**
 * Whether the app can actually use desktopCapturer for screen sources.
 * On macOS, getMediaAccessStatus('screen') sometimes stays non-granted while capture works;
 * a lightweight getSources probe matches real screenshot / window-title behavior.
 */
export async function hasEffectiveScreenRecordingAccess(): Promise<boolean> {
    if (process.platform !== 'darwin') {
        return true
    }
    if (systemPreferences.getMediaAccessStatus('screen') === 'granted') {
        return true
    }
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1, height: 1 },
        })
        return sources.length > 0
    } catch {
        return false
    }
}

/**
 * On macOS, we can't programmatically request screen recording permission like we can
 * for camera/microphone. The permission prompt is triggered automatically when we
 * attempt to use screen recording features (e.g., desktopCapturer or getting window info).
 *
 * This function returns information about how to enable the permission.
 */
export function getScreenRecordingPermissionInstructions(): string {
    if (process.platform === 'darwin') {
        return 'To enable activity tracking, please grant Screen Recording permission in System Settings > Privacy & Security > Screen Recording'
    }
    return ''
}

/**
 * Checks if we need to show permission instructions to the user
 */
export function shouldShowPermissionInstructions(): boolean {
    if (process.platform === 'darwin') {
        const status = getScreenRecordingPermissionStatus()
        return status === 'denied' || status === 'not-determined'
    }
    return false
}

/**
 * Global keyboard/mouse hooks (activity level) on macOS typically need Accessibility trust.
 * Input Monitoring may also be required depending on OS version — users enable both under
 * System Settings → Privacy & Security.
 */
export function getAccessibilityPermissionInstructions(): string {
    if (process.platform === 'darwin') {
        return 'Open System Settings → Privacy & Security → Accessibility (and Input Monitoring if listed) and enable Tabi.'
    }
    return ''
}
