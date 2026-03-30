import { apiClient } from './api.ts'
import { useQuery } from '@tanstack/vue-query'
import { computed, watch } from 'vue'
import type { MyMembership, MyMemberships } from '@solidtime/api'
import { currentMembershipId } from './currentMembershipStorage'
import { isLoggedIn } from './oauth'

export { currentMembershipId }

export function getMyMemberships() {
    return apiClient.value.getMyMemberships({})
}

export function useMyMemberships() {
    const query = useQuery({
        queryKey: ['myMemberships'],
        queryFn: getMyMemberships,
        enabled: computed(() => isLoggedIn.value),
    })
    const memberships = computed<MyMemberships>(() => {
        return query.data.value?.data ?? []
    })

    const currentMembership = computed(() => {
        return memberships.value?.find(
            (membership: MyMembership) => membership.id === currentMembershipId.value
        )
    })

    const currentOrganizationId = computed(() => {
        if (currentMembership.value) {
            return currentMembership.value?.organization?.id
        }
        return null
    })

    watch(
        memberships,
        () => {
            const firstId = memberships.value?.[0]?.id
            if (currentMembershipId.value === null) {
                if (firstId != null) {
                    currentMembershipId.value = firstId
                }
            } else if (
                !memberships.value.some(
                    (membership: MyMembership) => membership.id === currentMembershipId.value
                )
            ) {
                currentMembershipId.value = firstId ?? null
            }
        },
        { immediate: true }
    )
    return { query, memberships, currentOrganizationId, currentMembership }
}
