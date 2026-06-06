import { RouteRecordRaw } from 'vue-router'
import { EmbedEnum } from '@/enums/pageEnum'

const importPath = {
  'EmbedEnum.CHART_EMBED_NAME': () => import('@/views/embed/wrapper.vue'),
  'EmbedEnum.CHART_EMBED_ERROR_NAME': () => import('@/views/embed/error.vue'),
}

const embedRoutes: RouteRecordRaw[] = [
  {
    path: EmbedEnum.CHART_EMBED,
    name: EmbedEnum.CHART_EMBED_NAME,
    component: importPath['EmbedEnum.CHART_EMBED_NAME'],
    meta: {
      title: 'Embed',
      isEmbed: true,
      requiresAuth: false,
      isRoot: true,
      noKeepAlive: true,
    },
  },
  {
    path: EmbedEnum.CHART_EMBED_ERROR,
    name: EmbedEnum.CHART_EMBED_ERROR_NAME,
    component: importPath['EmbedEnum.CHART_EMBED_ERROR_NAME'],
    meta: {
      title: 'Embed Error',
      isEmbed: true,
      requiresAuth: false,
    },
  },
]

export default embedRoutes
