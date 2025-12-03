import { createApp } from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import router from './router'

const app = createApp(App).use(vuetify).use(router)

// Handle redirect from 404.html (for static site deployment)
router.isReady().then(() => {
  const redirectPath = sessionStorage.getItem('redirectPath')
  if (redirectPath && redirectPath !== '/') {
    sessionStorage.removeItem('redirectPath')
    router.replace(redirectPath)
  }

  // Hide the loading spinner after router is ready
  const loader = document.getElementById('app-loader')
  if (loader) {
    loader.style.opacity = '0'
    loader.style.transition = 'opacity 0.2s ease-out'
    setTimeout(() => loader.remove(), 200)
  }
})

app.mount('#app')
