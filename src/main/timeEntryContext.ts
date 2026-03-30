let currentTimeEntryId: string | null = null

export function setCurrentTimeEntryId(id: string | null): void {
    currentTimeEntryId = id
}

export function getCurrentTimeEntryId(): string | null {
    return currentTimeEntryId
}
