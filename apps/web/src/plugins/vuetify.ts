import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'kawa',
    themes: {
      kawa: {
        dark: true,
        colors: {
          primary: '#0e679a',
          secondary: '#afafaf',
          background: '#242b2f',
          surface: '#2f383d',
          'surface-bright': '#3a454b',
          'surface-variant': '#354048',
          'on-surface': '#afafaf',
          'on-background': '#afafaf'
        }
      }
    }
  }
})
