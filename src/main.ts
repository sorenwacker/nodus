import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n'
import './assets/main.css'

// Performance monitor (available as window.perfMonitor in dev mode)
import './lib/perfMonitor'

try {
  const app = createApp(App)
  app.use(createPinia())
  app.use(i18n)
  app.mount('#app')
} catch (e) {
  console.error('Nodus: Failed to mount app', e)
  const errorEl = document.createElement('pre')
  errorEl.style.cssText = 'color:red;padding:20px'
  errorEl.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`
  document.body.innerHTML = ''
  document.body.appendChild(errorEl)
}
