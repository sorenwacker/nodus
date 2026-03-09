import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'

try {
  const app = createApp(App)
  app.use(createPinia())
  app.mount('#app')
} catch (e) {
  console.error('Nodus: Failed to mount app', e)
  document.body.innerHTML = `<pre style="color:red;padding:20px">Error: ${e}</pre>`
}
