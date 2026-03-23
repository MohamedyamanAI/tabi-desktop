<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStorage } from '@vueuse/core'
import { XCircleIcon, XMarkIcon } from '@heroicons/vue/16/solid'

const props = defineProps<{
    organizationId: string | null
    isOrgBlocked: boolean
    membershipTier: string
}>()

const hideBlockedBanner = useSessionStorage(
    computed(() => `hideBlockedBanner-${props.organizationId ?? 'none'}`),
    false
)
const hideFreeUpgradeBanner = useSessionStorage(
    computed(() => `hideFreeUpgradeBanner-${props.organizationId ?? 'none'}`),
    false
)

const showBlockedBanner = computed(() => props.isOrgBlocked && !hideBlockedBanner.value)
const showFreeUpgradeBanner = computed(
    () => props.membershipTier === 'free' && !props.isOrgBlocked && !hideFreeUpgradeBanner.value
)
</script>

<template>
    <div
        v-if="showBlockedBanner || showFreeUpgradeBanner"
        :class="[
            'w-full text-xs lg:text-sm py-0.5 border-b border-border-secondary px-4',
            showBlockedBanner ? 'bg-red-600/50' : 'bg-tertiary',
        ]">
        <div class="flex items-center justify-between">
            <div v-if="showBlockedBanner" class="flex items-center space-x-1.5">
                <XCircleIcon class="w-4 text-text-primary/50"></XCircleIcon>
                <div class="flex-1 space-x-1">
                    <span class="font-medium">Your organization is currently blocked.</span>
                    <span class="hidden md:inline">
                        Please upgrade to a premium plan or reduce members to unblock your
                        organization.
                    </span>
                </div>
            </div>
            <div v-else-if="showFreeUpgradeBanner" class="flex items-center space-x-1.5">
                <XCircleIcon class="w-4 text-text-primary/50"></XCircleIcon>
                <div class="flex-1 space-x-1">
                    <span class="font-medium">You are currently using the Free plan.</span>
                    <span class="hidden md:inline">
                        To unlock premium features and support Tabi, please upgrade your plan.
                    </span>
                </div>
            </div>
            <button
                v-if="showBlockedBanner"
                class="p-1"
                @click="hideBlockedBanner = true">
                <XMarkIcon class="w-4 opacity-50 hover:opacity-100"></XMarkIcon>
            </button>
            <button
                v-else-if="showFreeUpgradeBanner"
                class="p-1"
                @click="hideFreeUpgradeBanner = true">
                <XMarkIcon class="w-4 opacity-50 hover:opacity-100"></XMarkIcon>
            </button>
        </div>
    </div>
</template>
