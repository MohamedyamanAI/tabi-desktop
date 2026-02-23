import { desktopCapturer, ipcMain, Notification } from 'electron'
import { getMainWindow } from './mainWindow'
import { getAppSettings } from './settings'
import * as Sentry from '@sentry/electron/main'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

let isTimerRunning = false
let currentTimeEntryId: string | null = null
let screenshotsEnabled = false
let intervalMinutes = 10

let windowInterval: NodeJS.Timeout | null = null
let captureTimeout: NodeJS.Timeout | null = null

// Queue for offline screenshots
interface PendingScreenshot {
    filePath: string
    timeEntryId: string
    capturedAt: string
    retryCount: number
}

let pendingUploads: PendingScreenshot[] = []
let retryTimeout: NodeJS.Timeout | null = null

export async function initializeScreenshotCapture(): Promise<void> {
    const appSettings = await getAppSettings()
    screenshotsEnabled = appSettings.screenshotCaptureEnabled ?? false
    intervalMinutes = appSettings.screenshotIntervalMinutes ?? 10

    console.log('Screenshot capture initialized with settings:', {
        screenshotsEnabled,
        intervalMinutes,
    })

    registerScreenshotCaptureListeners()
}

export function registerScreenshotCaptureListeners(): void {
    // Listen for timer state changes
    ipcMain.on('timerStateChanged', (_event, running: boolean) => {
        isTimerRunning = running
        if (running) {
            maybeStartCapture()
        } else {
            stopCapture()
        }
    })

    // Listen for time entry ID changes
    ipcMain.on('screenshotTimeEntryChanged', (_event, timeEntryId: string | null) => {
        currentTimeEntryId = timeEntryId
    })

    // Listen for screenshot settings updates
    ipcMain.on('updateScreenshotCaptureEnabled', (_event, enabled: boolean) => {
        screenshotsEnabled = enabled
        if (enabled && isTimerRunning) {
            maybeStartCapture()
        } else if (!enabled) {
            stopCapture()
        }
    })

    ipcMain.on('updateScreenshotInterval', (_event, minutes: number) => {
        if (typeof minutes === 'number' && minutes >= 1 && minutes <= 60) {
            intervalMinutes = minutes
            // Restart capture with new interval if running
            if (isTimerRunning && screenshotsEnabled) {
                stopCapture()
                maybeStartCapture()
            }
        }
    })

    // Handle upload result from renderer
    ipcMain.on('screenshotUploadResult', (_event, data: { filePath: string; success: boolean }) => {
        console.log(`Screenshot upload result: success=${data.success}, file=${data.filePath}`)
        if (data.success) {
            // Remove from pending and clean up temp file
            pendingUploads = pendingUploads.filter((p) => p.filePath !== data.filePath)
            try {
                if (fs.existsSync(data.filePath)) {
                    fs.unlinkSync(data.filePath)
                }
            } catch (err) {
                console.error('Failed to clean up screenshot file:', err)
            }
        } else {
            // Increment retry count
            const pending = pendingUploads.find((p) => p.filePath === data.filePath)
            if (pending) {
                pending.retryCount++
                if (pending.retryCount >= 10) {
                    // Give up after 10 retries
                    pendingUploads = pendingUploads.filter((p) => p.filePath !== data.filePath)
                    try {
                        if (fs.existsSync(data.filePath)) {
                            fs.unlinkSync(data.filePath)
                        }
                    } catch (err) {
                        console.error('Failed to clean up screenshot file:', err)
                    }
                } else {
                    // Schedule retry with exponential backoff
                    scheduleRetry()
                }
            }
        }
    })

    // Handle pending uploads count request
    ipcMain.handle('getScreenshotPendingCount', () => {
        return pendingUploads.length
    })
}

function maybeStartCapture(): void {
    if (!screenshotsEnabled || !isTimerRunning) return
    if (windowInterval) return // Already running

    console.log(`Starting screenshot capture with ${intervalMinutes} minute interval`)

    const intervalMs = intervalMinutes * 60 * 1000

    // Schedule first capture at a random time within the first interval
    scheduleRandomCapture(intervalMs)

    // Set up repeating interval for subsequent windows
    windowInterval = setInterval(() => {
        scheduleRandomCapture(intervalMs)
    }, intervalMs)
}

function scheduleRandomCapture(intervalMs: number): void {
    // Pick a random moment within the interval window
    const delay = Math.random() * intervalMs

    if (captureTimeout) {
        clearTimeout(captureTimeout)
    }

    captureTimeout = setTimeout(async () => {
        if (isTimerRunning && screenshotsEnabled) {
            await captureScreenshot()
        }
    }, delay)
}

async function captureScreenshot(): Promise<void> {
    try {
        if (!currentTimeEntryId) {
            console.warn('No active time entry ID for screenshot capture')
            return
        }

        // Use desktopCapturer to get screen source with small thumbnail
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 320, height: 180 },
        })

        if (sources.length === 0) {
            console.warn('No screen sources available for screenshot')
            return
        }

        const source = sources[0]
        let thumbnail = source.thumbnail

        // Apply pixelation blur: downscale to very small, then scale back up
        const small = thumbnail.resize({ width: 80, height: 45 })
        thumbnail = small.resize({ width: 320, height: 180 })

        // Convert to JPEG buffer
        const jpegBuffer = thumbnail.toJPEG(60)

        // Save to temp file
        const tempDir = path.join(app.getPath('temp'), 'solidtime-screenshots')
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
        }

        const fileName = `screenshot-${Date.now()}.jpg`
        const filePath = path.join(tempDir, fileName)
        fs.writeFileSync(filePath, jpegBuffer)

        const capturedAt = new Date().toISOString()

        // Add to pending uploads
        const pending: PendingScreenshot = {
            filePath,
            timeEntryId: currentTimeEntryId,
            capturedAt,
            retryCount: 0,
        }
        pendingUploads.push(pending)

        // Send to renderer for upload
        const mainWindow = getMainWindow()
        if (mainWindow) {
            console.log(`Sending screenshot to renderer: timeEntryId=${currentTimeEntryId}, capturedAt=${capturedAt}`)
            mainWindow.webContents.send('screenshotCaptured', {
                filePath,
                timeEntryId: currentTimeEntryId,
                capturedAt,
                base64: jpegBuffer.toString('base64'),
            })
        } else {
            console.error('Main window not available for screenshot upload')
        }

        // Show notification
        showCaptureNotification()

        console.log(`Screenshot captured and saved to ${filePath}`)
    } catch (error) {
        console.error('Failed to capture screenshot:', error)
        Sentry.captureException(error, {
            tags: { context: 'captureScreenshot' },
        })
    }
}

function showCaptureNotification(): void {
    try {
        const notification = new Notification({
            title: 'Screenshot captured',
            body: 'A screenshot was captured for time tracking.',
            silent: true,
        })
        notification.show()

        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            notification.close()
        }, 3000)
    } catch (error) {
        // Notifications may not be available on all platforms
        console.warn('Failed to show screenshot notification:', error)
    }
}

function scheduleRetry(): void {
    if (retryTimeout) return // Already scheduled

    const pendingWithRetries = pendingUploads.filter((p) => p.retryCount > 0)
    if (pendingWithRetries.length === 0) return

    // Exponential backoff based on lowest retry count
    const minRetry = Math.min(...pendingWithRetries.map((p) => p.retryCount))
    const delayMs = Math.min(1000 * Math.pow(2, minRetry), 300000) // Max 5 minutes

    retryTimeout = setTimeout(() => {
        retryTimeout = null

        const mainWindow = getMainWindow()
        if (!mainWindow) return

        for (const pending of pendingUploads.filter((p) => p.retryCount > 0)) {
            try {
                if (!fs.existsSync(pending.filePath)) {
                    // File was cleaned up, remove from queue
                    pendingUploads = pendingUploads.filter((p) => p.filePath !== pending.filePath)
                    continue
                }

                const buffer = fs.readFileSync(pending.filePath)
                mainWindow.webContents.send('screenshotCaptured', {
                    filePath: pending.filePath,
                    timeEntryId: pending.timeEntryId,
                    capturedAt: pending.capturedAt,
                    base64: buffer.toString('base64'),
                })
            } catch (error) {
                console.error('Failed to retry screenshot upload:', error)
            }
        }
    }, delayMs)
}

function stopCapture(): void {
    if (windowInterval) {
        clearInterval(windowInterval)
        windowInterval = null
    }
    if (captureTimeout) {
        clearTimeout(captureTimeout)
        captureTimeout = null
    }
    currentTimeEntryId = null
    console.log('Screenshot capture stopped')
}

export function stopScreenshotCapture(): void {
    stopCapture()

    if (retryTimeout) {
        clearTimeout(retryTimeout)
        retryTimeout = null
    }
}
