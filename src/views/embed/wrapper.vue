<template>
  <embed-view :key="key"></embed-view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import EmbedView from './index.vue'

const key = ref(Date.now())
</script>
