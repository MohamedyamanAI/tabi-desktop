import { uIOhook } from 'uiohook-napi'
import { db } from './db/client'
import { activitySamples } from './db/schema'
import { getCurrentTimeEntryId } from './timeEntryContext'
import { isOrgActivityTrackingEnabled } from './orgActivitySettings'
import { logger } from './logger'

let listenersAttached = false
let hookRunning = false
let currentBucketMinute: string | null = null
let keystrokes = 0
let mouseClicks = 0
let minuteTicker: ReturnType<typeof setInterval> | null = null

function minuteStartIso(d: Date): string {
    return new Date(
        Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            d.getUTCHours(),
            d.getUTCMinutes(),
            0,
            0
        )
    ).toISOString()
}

async function persistBucket(minute: string, ks: number, mc: number): Promise<void> {
    const timeEntryId = getCurrentTimeEntryId()
    if (!timeEntryId || timeEntryId.length === 0) {
        return
    }

    try {
        await db.insert(activitySamples).values({
            timestamp: minute,
            keystrokes: ks,
            mouseClicks: mc,
            timeEntryId,
            synced: false,
        })
        logger.info(
            'Activity sample saved (local SQLite)',
            JSON.stringify({
                minute,
                keystrokes: ks,
                mouse_clicks: mc,
                time_entry_id: timeEntryId,
            })
        )
    } catch (e) {
        logger.error('Failed to persist activity sample bucket:', e)
    }
}

/**
 * Close the current minute and open `newMinute`, persisting counts (including zeros).
 */
function rolloverToNewMinute(newMinute: string): void {
    if (currentBucketMinute === null) {
        currentBucketMinute = newMinute
        return
    }
    if (newMinute === currentBucketMinute) {
        return
    }
    const oldMinute = currentBucketMinute
    const ks = keystrokes
    const mc = mouseClicks
    currentBucketMinute = newMinute
    keystrokes = 0
    mouseClicks = 0
    void persistBucket(oldMinute, ks, mc)
}

function ensureBucketForEventTime(): void {
    const now = new Date()
    const m = minuteStartIso(now)

    if (currentBucketMinute === null) {
        currentBucketMinute = m
        return
    }

    if (m !== currentBucketMinute) {
        rolloverToNewMinute(m)
    }
}

function tickMinuteBoundary(): void {
    if (!listenersAttached || !hookRunning) {
        return
    }
    if (!isOrgActivityTrackingEnabled()) {
        return
    }
    const nowMin = minuteStartIso(new Date())
    if (currentBucketMinute === null) {
        currentBucketMinute = nowMin
        return
    }
    if (nowMin !== currentBucketMinute) {
        rolloverToNewMinute(nowMin)
    }
}

function onKeydown(): void {
    if (!isOrgActivityTrackingEnabled()) return
    ensureBucketForEventTime()
    keystrokes++
}

function onMousedown(): void {
    if (!isOrgActivityTrackingEnabled()) return
    ensureBucketForEventTime()
    mouseClicks++
}

export type CurrentActivityBucket = {
    timestamp: string
    keystrokes: number
    mouse_clicks: number
}

/**
 * Live counts for the current UTC minute (input hooks running). Null when not capturing.
 */
export function getCurrentActivityBucket(): CurrentActivityBucket | null {
    if (!listenersAttached || !hookRunning) {
        return null
    }
    const ts = currentBucketMinute ?? minuteStartIso(new Date())
    return {
        timestamp: ts,
        keystrokes,
        mouse_clicks: mouseClicks,
    }
}

export function startInputTracking(): void {
    if (listenersAttached) return
    listenersAttached = true

    currentBucketMinute = minuteStartIso(new Date())
    keystrokes = 0
    mouseClicks = 0

    if (minuteTicker === null) {
        minuteTicker = setInterval(tickMinuteBoundary, 1000)
    }

    uIOhook.on('keydown', onKeydown)
    uIOhook.on('mousedown', onMousedown)

    try {
        if (!hookRunning) {
            uIOhook.start()
            hookRunning = true
            logger.info(
                'uiohook started — per-minute keyboard/mouse counts (including idle minutes) persist to SQLite'
            )
        }
    } catch (e) {
        logger.error('Failed to start uiohook:', e)
    }
}

export async function stopInputTracking(): Promise<void> {
    if (minuteTicker !== null) {
        clearInterval(minuteTicker)
        minuteTicker = null
    }

    if (listenersAttached) {
        uIOhook.off('keydown', onKeydown)
        uIOhook.off('mousedown', onMousedown)
        listenersAttached = false
    }

    if (currentBucketMinute !== null) {
        const minute = currentBucketMinute
        const ks = keystrokes
        const mc = mouseClicks
        currentBucketMinute = null
        keystrokes = 0
        mouseClicks = 0
        await persistBucket(minute, ks, mc)
    }

    if (hookRunning) {
        try {
            uIOhook.stop()
        } catch (e) {
            logger.warn('uiohook stop failed:', e)
        }
        hookRunning = false
    }
}

/**
 * Flush open minute bucket (e.g. app quit). Safe when tracking is off.
 */
export async function flushInputTrackerBucket(): Promise<void> {
    if (currentBucketMinute === null) {
        return
    }
    const minute = currentBucketMinute
    const ks = keystrokes
    const mc = mouseClicks
    currentBucketMinute = null
    keystrokes = 0
    mouseClicks = 0
    await persistBucket(minute, ks, mc)
}
