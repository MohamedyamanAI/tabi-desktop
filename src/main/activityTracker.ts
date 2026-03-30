import { db } from './db/client'
import { windowActivities, validateNewWindowActivity } from './db/schema'
import { hasScreenRecordingPermission } from './permissions'
import { app } from 'electron'
import { logger } from './logger'
import { isOrgActivityTrackingEnabled } from './orgActivitySettings'
import { getCurrentTimeEntryId } from './timeEntryContext'

// Lazy-load x-win module with detailed error reporting
let xWinModule: typeof import('@miniben90/x-win') | null = null
let xWinLoadError: Error | null = null

async function loadXWinModule() {
    if (xWinModule) return xWinModule
    if (xWinLoadError) throw xWinLoadError

    try {
        console.log('=== ATTEMPTING TO LOAD @miniben90/x-win ===')
        console.log('Process platform:', process.platform)
        console.log('Process arch:', process.arch)
        console.log('Process versions:', JSON.stringify(process.versions, null, 2))
        console.log('__dirname:', __dirname)
        console.log('process.cwd():', process.cwd())
        console.log('app.isPackaged:', app.isPackaged)

        xWinModule = await import('@miniben90/x-win')
        console.log('=== @miniben90/x-win LOADED SUCCESSFULLY ===')
        return xWinModule
    } catch (error) {
        console.error('=== FAILED TO LOAD @miniben90/x-win ===')
        console.error('Error name:', error instanceof Error ? error.name : 'Unknown')
        console.error('Error message:', error instanceof Error ? error.message : String(error))
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
        console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))

        xWinLoadError = error instanceof Error ? error : new Error(String(error))
        throw xWinLoadError
    }
}

interface WindowInfo {
    id: number
    title: string
    info: {
        execName: string
        name: string
        path: string
        processId: number
    }
    os: string
    position: {
        x: number
        y: number
        width: number
        height: number
        isFullScreen: boolean
    }
    usage: {
        memory: number
    }
    url?: string
}

let subscriptionId: number | null = null
let lastWindowInfo: WindowInfo | null = null
let currentActivityStartTime: Date | null = null
/** Time entry for the open segment [currentActivityStartTime, now]; never written with null. */
let segmentTimeEntryId: string | null = null

/**
 * Sanitizes a URL by removing query parameters and fragments
 * This protects privacy by removing potentially sensitive data
 */
function sanitizeUrl(url: string | undefined): string | null {
    if (!url) return null

    try {
        const urlObj = new URL(url)
        // Keep only protocol, hostname, port, and pathname
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
    } catch {
        // If URL parsing fails, return null to avoid storing invalid data
        return null
    }
}

/**
 * Initializes the activity tracker
 * Loads settings and starts tracking if enabled
 */
export async function initializeActivityTracker() {
    try {
        logger.info('Activity tracker initialized (window tracking follows org activity settings)')
    } catch (error) {
        logger.error('Failed to initialize activity tracker:', error)
    }
}

/**
 * Starts tracking window activity
 */
export async function startActivityTracking(): Promise<void> {
    // Check if already tracking
    if (subscriptionId !== null) {
        logger.info('Activity tracking already running')
        return
    }

    // Check permissions on macOS
    if (!hasScreenRecordingPermission()) {
        logger.warn('Screen recording permission not granted. Activity tracking may not work.')
        // We'll still try to start tracking - the first attempt to get window info
        // will trigger the permission prompt on macOS
    }

    logger.info('Starting activity tracking...')

    let xWin
    try {
        xWin = await loadXWinModule()
    } catch (error) {
        logger.error('Cannot start activity tracking - x-win module failed to load:', error)
        return
    }

    try {
        // Get initial window state
        const initialWindow = await xWin.activeWindowAsync()
        if (initialWindow) {
            lastWindowInfo = initialWindow as WindowInfo
            currentActivityStartTime = new Date()
            segmentTimeEntryId = getCurrentTimeEntryId()
            logger.debug('Initial window:', lastWindowInfo.info.name, '-', lastWindowInfo.title)
        }
    } catch (error) {
        logger.error('Failed to get initial window:', error)
        // This might be due to missing permissions - log but continue
    }

    // Subscribe to window changes
    subscriptionId = xWin.subscribeActiveWindow(async (error, windowInfo) => {
        if (error) {
            logger.error('Error in window subscription:', error)
            return
        }

        if (!windowInfo) {
            return
        }

        await handleWindowChange(windowInfo as WindowInfo)
    })

    logger.info('Activity tracking started with subscription ID:', subscriptionId)
}

/**
 * Handles a window change event
 */
async function handleWindowChange(windowInfo: WindowInfo): Promise<void> {
    const now = new Date()

    // Check if this is a different window than the last one
    const isNewWindow =
        !lastWindowInfo ||
        lastWindowInfo.title !== windowInfo.title ||
        lastWindowInfo.info.name !== windowInfo.info.name

    if (isNewWindow && lastWindowInfo && currentActivityStartTime) {
        // Save the previous window activity only when tied to a running time entry
        if (isOrgActivityTrackingEnabled() && segmentTimeEntryId) {
            try {
                await saveWindowActivity(
                    lastWindowInfo,
                    currentActivityStartTime,
                    now,
                    segmentTimeEntryId
                )
            } catch (error) {
                logger.error('Failed to save window activity:', error)
            }
        }

        // Update to new window
        lastWindowInfo = windowInfo
        currentActivityStartTime = now
        segmentTimeEntryId = getCurrentTimeEntryId()

        logger.debug('Window changed to:', windowInfo.info.name, '-', windowInfo.title)
    } else if (!lastWindowInfo) {
        // First window detected
        lastWindowInfo = windowInfo
        currentActivityStartTime = now
        segmentTimeEntryId = getCurrentTimeEntryId()
    }
}

/**
 * Saves a window activity to the database
 */
async function saveWindowActivity(
    windowInfo: WindowInfo,
    startTime: Date,
    endTime: Date,
    timeEntryId: string
): Promise<void> {
    if (!timeEntryId) {
        return
    }
    try {
        const timestamp = startTime.toISOString()
        const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)

        // Skip if duration is 0 or negative
        if (durationSeconds <= 0) {
            return
        }

        const activity = {
            timestamp,
            durationSeconds,
            appName: windowInfo.info.name || windowInfo.info.execName || 'Unknown',
            windowTitle: windowInfo.title || 'Untitled',
            url: sanitizeUrl(windowInfo.url),
            processId: windowInfo.info.processId || null,
            timeEntryId,
            synced: false,
        }

        // Validate before insertion
        validateNewWindowActivity(activity)

        await db.insert(windowActivities).values(activity)

        logger.debug(
            `Saved window activity: ${activity.appName} - ${activity.windowTitle} (${durationSeconds}s)`
        )
    } catch (error) {
        logger.error('Failed to save window activity:', error)
        if (error instanceof Error) {
            logger.error('Error details:', error.message)
        }
    }
}

/**
 * Saves the current activity if there is one (used when stopping tracking)
 */
async function saveCurrentActivityIfNeeded(): Promise<void> {
    if (!lastWindowInfo || !currentActivityStartTime || !segmentTimeEntryId) {
        return
    }

    // Check enabled state before database operation
    if (!isOrgActivityTrackingEnabled()) {
        return
    }

    const now = new Date()

    try {
        await saveWindowActivity(
            lastWindowInfo,
            currentActivityStartTime,
            now,
            segmentTimeEntryId
        )
    } catch (error) {
        logger.error('Failed to save current activity:', error)
    }
}

/**
 * Stops tracking window activity
 */
export async function stopActivityTracking(): Promise<void> {
    logger.info('Stopping activity tracking...')

    // Save the current window activity before stopping
    await saveCurrentActivityIfNeeded()

    // Unsubscribe from window changes
    if (subscriptionId !== null && xWinModule) {
        xWinModule.unsubscribeAllActiveWindow()
        subscriptionId = null
    }

    lastWindowInfo = null
    currentActivityStartTime = null
    segmentTimeEntryId = null

    logger.info('Activity tracking stopped')
}

/**
 * Await before setCurrentTimeEntryId when the renderer updates the active time entry id.
 * Flushes the open window segment when the timer stops; starts a fresh segment when it starts.
 */
export async function handleScreenshotTimeEntryIdChanged(
    previousId: string | null,
    nextId: string | null
): Promise<void> {
    if (previousId && nextId === null) {
        const teForSave = segmentTimeEntryId ?? previousId
        if (
            isOrgActivityTrackingEnabled() &&
            lastWindowInfo &&
            currentActivityStartTime &&
            teForSave
        ) {
            try {
                await saveWindowActivity(
                    lastWindowInfo,
                    currentActivityStartTime,
                    new Date(),
                    teForSave
                )
            } catch (e) {
                logger.error('Failed to flush window activity on timer stop:', e)
            }
        }
        currentActivityStartTime = new Date()
        segmentTimeEntryId = null
        return
    }

    if (nextId && previousId === null) {
        currentActivityStartTime = new Date()
        segmentTimeEntryId = nextId
        return
    }

    if (nextId && previousId && nextId !== previousId) {
        if (
            isOrgActivityTrackingEnabled() &&
            lastWindowInfo &&
            currentActivityStartTime &&
            segmentTimeEntryId
        ) {
            try {
                await saveWindowActivity(
                    lastWindowInfo,
                    currentActivityStartTime,
                    new Date(),
                    segmentTimeEntryId
                )
            } catch (e) {
                logger.error('Failed to flush window activity on time entry id change:', e)
            }
        }
        currentActivityStartTime = new Date()
        segmentTimeEntryId = nextId
    }
}
