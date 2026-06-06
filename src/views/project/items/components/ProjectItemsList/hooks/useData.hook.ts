import { useRouter } from 'vue-router'
import { ref, onMounted } from 'vue'
import { goDialog, setSessionStorage } from '@/utils'
import { StorageEnum } from '@/enums/storageEnum'
import { DialogEnum } from '@/enums/pluginEnum'
import { ChartList, Chartype } from '../../../index.d'
import { getProjectsApi, deleteProjectApi, getProjectApi } from '@/api/storage.api'
import { fetchPathByName, routerTurnByPath } from '@/utils'
import { PreviewEnum } from '@/enums/pageEnum'

// Khởi tạo dữ liệu
export const useDataListInit = () => {
  const list = ref<ChartList>([])
  const router = useRouter()
  const embedPanelShow = ref(false)
  const embedDashboardId = ref('')
  const embedProjectData = ref<Record<string, unknown> | null>(null)

  const getItem = async () => {
    // Thử lấy từ Server SQLite trước
    const storageList = await getProjectsApi()
    if (storageList) {
      list.value = storageList.map((item: any) => {
        return {
          id: item.id,
          title: item.editCanvasConfig?.projectName || 'Dự án mới',
          release: item.isPublished || false,
          label: 'Dự án',
          image: item.editCanvasConfig?.backgroundImage || ''
        }
      })
    }
  }

  onMounted(() => {
    getItem()
  })

  // Xem trước (Preview)
  const previewHandle = (cardData: Chartype) => {
    const path = fetchPathByName(PreviewEnum.CHART_PREVIEW_NAME, 'href')
    if (!path) return
    const previewId = String(cardData.id)
    
    // Đặt vào SessionStorage để Preview page có thể đọc
    getProjectApi(previewId).then(storageInfo => {
      if (storageInfo) {
        setSessionStorage(StorageEnum.GO_CHART_STORAGE_LIST, [{ id: previewId, ...storageInfo }])
        routerTurnByPath(path, [previewId], undefined, true)
      }
    })
  }

  // Phát hành (Publish & Embed)
  const publishHandle = async (cardData: Chartype) => {
    const fullProject = await getProjectApi(String(cardData.id))
    if (!fullProject) {
      window['$message'].error('Không thể tải dự án.')
      return
    }
    embedDashboardId.value = String(cardData.id)
    embedProjectData.value = fullProject
    embedPanelShow.value = true
  }

  const handleEmbedSaved = () => {
    getItem()
  }

  // xóa bỏ
  const deleteHandle = (cardData: Chartype, index: number) => {
    goDialog({
      type: DialogEnum.DELETE,
      promise: true,
      onPositiveCallback: async () => {
        const res = await deleteProjectApi(cardData.id as string)
        if (res && res.success) {
          return Promise.resolve(1)
        } else {
          window['$message'].error('Không thể xóa dự án trên máy chủ.')
          return Promise.reject(0)
        }
      },
      promiseResCallback: (e: any) => {
        window['$message'].success(window['$t']('phase7.auto_149'))
        const listIndex = list.value.findIndex((item: any) => String(item.id) === String(cardData.id))
        if (listIndex !== -1) {
          list.value.splice(listIndex, 1)
        }
      }
    })
  }

  return {
    list,
    deleteHandle,
    publishHandle,
    previewHandle,
    embedPanelShow,
    embedDashboardId,
    embedProjectData,
    handleEmbedSaved,
  }
}
