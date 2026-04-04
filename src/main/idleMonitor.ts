import { powerMonitor, ipcMain, dialog, systemPreferences } from 'electron'
import { getMainWindow } from './mainWindow'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import duration from 'dayjs/plugin/duration'
import type { Dayjs } from 'dayjs'
import { db } from './db/client'
import { activityPeriods, validateNewActivityPeriod } from './db/schema'

// Configure dayjs for main process
dayjs.extend(utc)
dayjs.extend(duration)

// Helper functions for formatting (replicate UI package functionality for main process)
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`
    } else {
        return `${secs}s`
    }
}

function formatTime(isoString: string): string {
    return dayjs(isoString).format('HH:mm:ss')
}

let idleCheckInterval: NodeJS.Timeout | null = null
let isIdle = false
let idleStartTime: Dayjs | null = null
let activeStartTime: Dayjs | null = null
let idleThreshold = 300
let idleDetectionEnabled = true
let isTimerRunning = false
let waitingForUserResponse = false

export async function initializeIdleMonitor() {
    // Request accessibility permission on macOS (required for getSystemIdleTime to work)
    if (process.platform === 'darwin') {
        systemPreferences.isTrustedAccessibilityClient(true)
    }

    console.log('Idle monitor initialized with defaults:', {
        idleThreshold,
        idleDetectionEnabled,
    })

    registerIdleMonitorListeners()

    if (idleDetectionEnabled) {
        startIdleMonitoring()
    }
}

function registerIdleMonitorListeners() {
    ipcMain.on(
        'updateOrgIdleSettings',
        (_event, settings: { enabled: boolean; thresholdMinutes: number } | null) => {
            if (settings === null) {
                idleDetectionEnabled = true
                idleThreshold = 300
                console.log('Idle detection reset to defaults (no org settings)')
                if (!idleCheckInterval) {
                    startIdleMonitoring()
                }
                return
            }

            const newThreshold =
                typeof settings.thresholdMinutes === 'number' &&
                settings.thresholdMinutes >= 1 &&
                settings.thresholdMinutes <= 60
                    ? settings.thresholdMinutes * 60
                    : 300
            idleThreshold = newThreshold

            const newEnabled = settings.enabled
            if (newEnabled && !idleDetectionEnabled) {
                idleDetectionEnabled = true
                if (!idleCheckInterval) {
                    startIdleMonitoring()
                }
            } else if (!newEnabled && idleDetectionEnabled) {
                idleDetectionEnabled = false
                if (idleCheckInterval) {
                    stopIdleMonitoring()
                }
            } else {
                idleDetectionEnabled = newEnabled
            }

            console.log('Idle detection settings updated:', {
                enabled: idleDetectionEnabled,
                thresholdSeconds: idleThreshold,
            })
        }
    )

    ipcMain.on('timerStateChanged', (_event, running: boolean) => {
        isTimerRunning = running
        console.log('Timer state changed:', running)
    })
}

function startIdleMonitoring() {
    if (idleCheckInterval) {
        console.log('Idle monitoring already running, skipping start')
        return
    }

    console.log('Starting idle monitoring')

    isIdle = false
    idleStartTime = null

    const currentIdleTime = powerMonitor.getSystemIdleTime()
    if (currentIdleTime >= idleThreshold) {
        isIdle = true
        const now = dayjs()
        idleStartTime = now.subtract(currentIdleTime, 'seconds')
        activeStartTime = null
        console.log(
            `System already idle when monitoring started. Idle since: ${idleStartTime.toISOString()}`
        )
    } else {
        activeStartTime = dayjs()
    }

    idleCheckInterval = setInterval(() => {
        const idleTime = powerMonitor.getSystemIdleTime()

        if (idleTime >= idleThreshold) {
            if (!isIdle) {
                isIdle = true
                const now = dayjs()
                idleStartTime = now.subtract(idleTime, 'seconds')

                console.log(`System became idle at ${idleStartTime.toISOString()}`)

                if (activeStartTime) {
                    const endTime = idleStartTime.isBefore(activeStartTime)
                        ? activeStartTime
                        : idleStartTime

                    saveActivityPeriod(
                        activeStartTime.utc().format(),
                        endTime.utc().format(),
                        false
                    )
                    activeStartTime = null
                }
            }
        } else {
            if (isIdle && idleStartTime) {
                const idleEnd = dayjs()
                const idleDurationSeconds = idleEnd.diff(idleStartTime, 'seconds')

                console.log(
                    `System became active at ${idleEnd.toISOString()}, idle duration: ${idleDurationSeconds}s`
                )

                const capturedIdleStart = idleStartTime.utc().format()
                const capturedIdleEnd = idleEnd.utc().format()
                const capturedDuration = idleDurationSeconds

                isIdle = false
                idleStartTime = null
                activeStartTime = idleEnd

                if (isTimerRunning && !waitingForUserResponse) {
                    waitingForUserResponse = true

                    showIdleDialog(capturedIdleStart, capturedIdleEnd, capturedDuration)
                        .then(() => {
                            waitingForUserResponse = false
                        })
                        .catch((error) => {
                            console.error('Error showing idle dialog:', error)
                            waitingForUserResponse = false
                        })
                } else if (!isTimerRunning) {
                    saveActivityPeriod(capturedIdleStart, capturedIdleEnd, true)
                }
            }
        }
    }, 1000)
}

async function saveActivityPeriod(start: string, end: string, isIdlePeriod: boolean) {
    try {
        const newPeriod = {
            start,
            end,
            isIdle: isIdlePeriod,
        }

        validateNewActivityPeriod(newPeriod)

        await db.insert(activityPeriods).values(newPeriod)
        console.log(`Saved ${isIdlePeriod ? 'idle' : 'active'} period: ${start} to ${end}`)
    } catch (error) {
        console.error('Failed to save activity period:', error)
        if (error instanceof Error) {
            console.error('Error details:', error.message)
        }
    }
}

async function showIdleDialog(idleStartTime: string, idleEndTime: string, durationSeconds: number) {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
        return
    }

    const formattedDuration = formatDuration(durationSeconds)
    const startTime = formatTime(idleStartTime)
    const endTime = formatTime(idleEndTime)

    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }
    mainWindow.focus()

    const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Idle Time Detected',
        message: 'You were away from your computer',
        detail: `Idle Duration: ${formattedDuration}\nIdle Start: ${startTime}\nActivity Resumed: ${endTime}\n\nWhat would you like to do with the idle time?`,
        buttons: ['Keep Idle Time', 'Discard Idle Time', 'Discard & Start New Timer'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
    })

    if (result.response === 0) {
        await saveActivityPeriod(idleStartTime, idleEndTime, true)
    } else if (result.response === 1) {
        console.log('User discarded idle time')
    } else if (result.response === 2) {
        console.log('User discarded idle time and will start new timer')
    }

    mainWindow.webContents.send('idleDialogResponse', {
        choice: result.response,
        idleStartTime,
        idleEndTime,
    })
}

async function stopIdleMonitoring() {
    if (activeStartTime && !isIdle) {
        const now = dayjs()
        await saveActivityPeriod(activeStartTime.toISOString(), now.toISOString(), false)
    }

    if (idleStartTime && isIdle) {
        const now = dayjs()
        await saveActivityPeriod(idleStartTime.toISOString(), now.toISOString(), true)
    }

    if (idleCheckInterval) {
        clearInterval(idleCheckInterval)
        idleCheckInterval = null
    }
    isIdle = false
    idleStartTime = null
    activeStartTime = null
    waitingForUserResponse = false
}

export function getCurrentActivityPeriod(): { start: string; end: string; isIdle: boolean } | null {
    const now = dayjs()

    if (isIdle && idleStartTime) {
        return {
            start: idleStartTime.utc().format(),
            end: now.utc().format(),
            isIdle: true,
        }
    } else if (!isIdle && activeStartTime) {
        return {
            start: activeStartTime.utc().format(),
            end: now.utc().format(),
            isIdle: false,
        }
    }

    return null
}

export { startIdleMonitoring, stopIdleMonitoring }