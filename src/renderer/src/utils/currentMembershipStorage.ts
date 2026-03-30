import { useStorage } from '@vueuse/core'

/** Persisted selected org membership; shared with OAuth login flow. */
export const currentMembershipId = useStorage<string | null>('currentMembershipId', null)
