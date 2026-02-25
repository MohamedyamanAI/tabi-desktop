import { createApp } from 'vue'
import Mini from './Mini.vue'
import './style.css'
import { VueQueryPlugin } from '@tanstack/vue-query'
const app = createApp(Mini)

import * as Sentry from '@sentry/electron/renderer'

// Only initialize when you provide your own DSN (no data sent to third parties by default)
if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
    })
}

app.use(VueQueryPlugin)
app.mount('#app')
