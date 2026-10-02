<template>
  <div class="mx-auto max-w-md p-10 text-center">
    <h1 class="mb-3 text-2xl font-semibold">{{ t('Page not found') }}</h1>
    <RouterLink :to="{ name: 'home', params: { script } }" class="btn-primary">{{ t('Home') }}</RouterLink>
  </div>
</template>

<script setup lang="ts">
import { useScript } from '@/composables/script'
import { t } from '@/i18n'
const { script } = useScript()
</script>
