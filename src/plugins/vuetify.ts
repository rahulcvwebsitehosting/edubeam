/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

// Composables
import { createVuetify } from 'vuetify';
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n';
import { i18n } from './i18n';
import { useI18n } from 'vue-i18n';

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    themes: {
      light: {
        colors: {
          primary: '#1E40AF',
          secondary: '#F1F5F9',
          accent: '#D97706',
          success: '#047857',
          warning: '#B45309',
          error: '#DC2626',
          background: '#F8FAFC',
          surface: '#FFFFFF',
        },
      },
    },
  },
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n }),
  },
});
