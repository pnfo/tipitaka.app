<template>
  <div class="mx-auto max-w-3xl px-4 pb-20 pt-6">
    <h1 class="mb-4 text-2xl font-semibold">{{ t('Bookmarks') }}</h1>
    <p v-if="!library.bookmarks.length" class="mb-8 text-muted">{{ t('No bookmarks yet. Use the bookmark button while reading.') }}</p>
    <ul v-else class="mb-10 divide-y divide-line" data-testid="bookmarks">
      <li v-for="b in library.bookmarks" :key="b.key + b.para" class="flex items-center gap-2 py-2">
        <RouterLink :to="{ name: 'read', params: { script, key: b.key }, hash: `#p${b.para}` }" class="min-w-0 flex-1 hover:text-primary">
          <div class="pali truncate font-medium">{{ conv(b.title) }}</div>
          <div class="pali truncate text-xs text-muted">{{ conv(b.path) }}</div>
        </RouterLink>
        <button class="icon-btn" :aria-label="t('Remove')" @click="library.removeBookmark(b)"><IconTrash class="h-4 w-4" /></button>
      </li>
    </ul>
    <div class="mb-2 flex items-center">
      <h2 class="flex-1 text-lg font-semibold">{{ t('History') }}</h2>
      <button v-if="library.history.length" class="text-xs text-muted underline" @click="library.clearHistory()">{{ t('Clear') }}</button>
    </div>
    <ul class="divide-y divide-line">
      <li v-for="h in library.history" :key="h.key">
        <RouterLink :to="{ name: 'read', params: { script, key: h.key } }" class="block py-2 hover:text-primary">
          <div class="pali truncate">{{ conv(h.title) }}</div>
          <div class="pali truncate text-xs text-muted">{{ conv(h.path) }}</div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useHead } from '@unhead/vue'
import IconTrash from '~icons/lucide/trash-2'
import { useLibrary } from '@/stores/library'
import { useScript } from '@/composables/script'
import { t } from '@/i18n'

const library = useLibrary()
const { script, conv } = useScript()
useHead({ title: t('Bookmarks') })
</script>
