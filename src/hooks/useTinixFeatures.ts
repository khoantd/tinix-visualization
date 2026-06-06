import { ref, computed, onMounted } from 'vue'
import { getHealthApi, type HealthResponse } from '@/api/storage.api'

const loading = ref(true)
const health = ref<HealthResponse | null>(null)
const fetchError = ref<string | null>(null)
let fetchStarted = false

const buildTimeFeatures = import.meta.env.VITE_TINIX_FEATURES as string | undefined

function resolveModules(data: HealthResponse | null): string[] {
  if (data?.modules?.length) return data.modules
  if (buildTimeFeatures === 'full') {
    return ['core', 'auto-bi', 'connectors', 'embed', 'agent']
  }
  if (buildTimeFeatures === 'core') return ['core']
  if (data?.features === 'full') {
    return ['core', 'auto-bi', 'connectors', 'embed', 'agent']
  }
  return ['core']
}

async function loadHealth() {
  if (fetchStarted && !loading.value) return
  fetchStarted = true
  loading.value = true
  fetchError.value = null
  try {
    health.value = await getHealthApi()
  } catch (err: unknown) {
    fetchError.value = err instanceof Error ? err.message : 'Health check failed'
    health.value = {
      status: 'error',
      features: buildTimeFeatures === 'full' ? 'full' : 'core',
      database: 'unconfigured',
      modules: resolveModules(null),
    }
  } finally {
    loading.value = false
  }
}

export function useTinixFeatures() {
  onMounted(() => {
    if (!fetchStarted) loadHealth()
  })

  const modules = computed(() => resolveModules(health.value))

  const features = computed(() => health.value?.features ?? (buildTimeFeatures === 'full' ? 'full' : 'core'))

  const database = computed(() => health.value?.database ?? 'unconfigured')

  const isCoreMode = computed(() => features.value === 'core')

  const isServerless = computed(() => database.value === 'neon' || Boolean(import.meta.env.PROD))

  function hasModule(name: string): boolean {
    return modules.value.includes(name)
  }

  return {
    loading,
    health,
    fetchError,
    modules,
    features,
    database,
    isCoreMode,
    isServerless,
    hasModule,
    refresh: loadHealth,
  }
}
