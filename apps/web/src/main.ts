import { createApp } from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import router from './router'

const app = createApp(App)
  .use(vuetify)
  .use(router)

// Handle redirect from 404.html (for static site deployment)
router.isReady().then(() => {
  const redirectPath = sessionStorage.getItem('redirectPath')
  if (redirectPath && redirectPath !== '/') {
    sessionStorage.removeItem('redirectPath')
    router.replace(redirectPath)
  }
})

app.mount('#app')
