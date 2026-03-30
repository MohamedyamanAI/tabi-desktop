/**
 * Deletes local SQLite rows (activity_samples + window_activities) for removed time entries.
 * Called after successful API delete so desktop stats match the server.
 */
export async function deleteLocalActivityForTimeEntryIds(timeEntryIds: string[]): Promise<void> {
    const ids = [...new Set(timeEntryIds.filter((id) => typeof id === 'string' && id.length > 0))]
    if (!ids.length) {
        return
    }
    const api = window.electronAPI?.deleteLocalActivityForTimeEntries
    if (!api) {
        return
    }
    try {
        const result = await api(ids)
        if (!result.success) {
            console.warn('deleteLocalActivityForTimeEntries:', result.error)
        }
    } catch (e) {
        console.warn('deleteLocalActivityForTimeEntries failed:', e)
    }
}
