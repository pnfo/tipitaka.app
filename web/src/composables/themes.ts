import { computed } from 'vue'
import type { Theme } from '@/stores/settings'
import { t } from '@/i18n'

/** the colour themes with their swatch colours (settings, menu); auto (light or dark as the system) is split between two */
export const useThemes = () => computed<{ id: Theme; label: string; bg: string; fg: string }[]>(() => [
  { id: 'light', label: t('Light'), bg: '#fbf8f3', fg: '#2b2522' }, { id: 'sepia', label: t('Sepia'), bg: '#f4ecd8', fg: '#3b2f22' },
  { id: 'green', label: t('Green'), bg: '#e4ede0', fg: '#1e2a21' }, { id: 'dark', label: t('Dark'), bg: '#1b1917', fg: '#e6dfd6' },
  { id: 'auto', label: t('Auto'), bg: 'linear-gradient(135deg, #fbf8f3 0 50%, #1b1917 50% 100%)', fg: '#2b2522' },
])
