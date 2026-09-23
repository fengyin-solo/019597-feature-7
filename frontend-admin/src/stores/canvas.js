import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const MM_TO_DOT = 8
const STORAGE_KEY = 'label-editor-canvas'

// 从 localStorage 恢复画布状态（含图片元件的图片内容、文件名与填充方式）
function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.elements)) return null

    // 兼容旧数据：图片元件没有填充方式时补上默认值
    data.elements = data.elements.map(el => el.type === 'image'
      ? { imageFit: 'contain', ...el }
      : el)
    return data
  } catch (err) {
    console.warn('恢复画布状态失败:', err)
    return null
  }
}

export const useCanvasStore = defineStore('canvas', () => {
  const persisted = loadPersistedState()

  const canvasWidth = ref(persisted?.canvasWidth ?? 80)
  const canvasHeight = ref(persisted?.canvasHeight ?? 60)
  const scale = ref(1)
  const elements = ref(persisted?.elements ?? [])
  const selectedElementId = ref(null)
  const selectedElementIds = ref([])
  // 保证恢复后新增元件的 id 不与已有元件冲突
  let elementIdCounter = persisted?.elementIdCounter
    ?? elements.value.reduce((max, el) => {
      const n = parseInt(String(el.id).replace(/^\D+/, ''), 10)
      return Number.isFinite(n) ? Math.max(max, n) : max
    }, 0)

  const canvasPixelWidth = computed(() => canvasWidth.value * MM_TO_DOT)
  const canvasPixelHeight = computed(() => canvasHeight.value * MM_TO_DOT)

  const selectedElement = computed(() => {
    if (!selectedElementId.value) return null
    return elements.value.find(el => el.id === selectedElementId.value)
  })

  const selectedElements = computed(() => {
    return elements.value.filter(el => selectedElementIds.value.includes(el.id))
  })

  function setCanvasSize(width, height) {
    canvasWidth.value = width
    canvasHeight.value = height
  }

  function setScale(newScale) {
    scale.value = Math.max(0.25, Math.min(4, newScale))
  }

  function addElement(element) {
    const id = `element_${++elementIdCounter}`
    const newElement = {
      id,
      ...element,
      x: element.x || 10,
      y: element.y || 10,
      width: element.width || 100,
      height: element.height || 30,
      rotation: element.rotation || 0,
      locked: false,
      visible: true
    }
    // 图片元件默认“等比适应”，随元件一起保存
    if (newElement.type === 'image' && !newElement.imageFit) {
      newElement.imageFit = 'contain'
    }
    elements.value.push(newElement)
    selectElement(id)
    return id
  }

  function updateElement(id, updates) {
    const index = elements.value.findIndex(el => el.id === id)
    if (index !== -1) {
      elements.value[index] = { ...elements.value[index], ...updates }
    }
  }

  function deleteElement(id) {
    const index = elements.value.findIndex(el => el.id === id)
    if (index !== -1) {
      elements.value.splice(index, 1)
      selectedElementIds.value = selectedElementIds.value.filter(eid => eid !== id)
      
      // 删除后选中第一个元件
      if (elements.value.length > 0) {
        const firstElement = elements.value[elements.value.length - 1]
        selectedElementId.value = firstElement.id
        selectedElementIds.value = [firstElement.id]
      } else {
        selectedElementId.value = null
        selectedElementIds.value = []
      }
    }
  }

  function selectElement(id, multiSelect = false) {
    if (multiSelect) {
      if (selectedElementIds.value.includes(id)) {
        selectedElementIds.value = selectedElementIds.value.filter(eid => eid !== id)
        if (selectedElementIds.value.length > 0) {
          selectedElementId.value = selectedElementIds.value[selectedElementIds.value.length - 1]
        } else {
          selectedElementId.value = null
        }
      } else {
        selectedElementIds.value.push(id)
        selectedElementId.value = id
      }
    } else {
      selectedElementId.value = id
      selectedElementIds.value = id ? [id] : []
    }
  }

  function clearSelection() {
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  // 多选元件之间对齐
  function alignElements(alignment) {
    const selected = selectedElements.value
    if (selected.length < 2) return

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...selected.map(el => el.x))
        selected.forEach(el => updateElement(el.id, { x: minX }))
        break
      }
      case 'right': {
        const maxRight = Math.max(...selected.map(el => el.x + el.width))
        selected.forEach(el => updateElement(el.id, { x: maxRight - el.width }))
        break
      }
      case 'center-h': {
        const minX = Math.min(...selected.map(el => el.x))
        const maxRight = Math.max(...selected.map(el => el.x + el.width))
        const centerX = (minX + maxRight) / 2
        selected.forEach(el => updateElement(el.id, { x: Math.round(centerX - el.width / 2) }))
        break
      }
      case 'top': {
        const minY = Math.min(...selected.map(el => el.y))
        selected.forEach(el => updateElement(el.id, { y: minY }))
        break
      }
      case 'bottom': {
        const maxBottom = Math.max(...selected.map(el => el.y + el.height))
        selected.forEach(el => updateElement(el.id, { y: maxBottom - el.height }))
        break
      }
      case 'center-v': {
        const minY = Math.min(...selected.map(el => el.y))
        const maxBottom = Math.max(...selected.map(el => el.y + el.height))
        const centerY = (minY + maxBottom) / 2
        selected.forEach(el => updateElement(el.id, { y: Math.round(centerY - el.height / 2) }))
        break
      }
    }
  }

  function duplicateElement(id) {
    const element = elements.value.find(el => el.id === id)
    if (!element) return

    const newElement = {
      ...element,
      x: Math.min(element.x + 20, canvasPixelWidth.value - element.width),
      y: Math.min(element.y + 20, canvasPixelHeight.value - element.height)
    }
    delete newElement.id
    return addElement(newElement)
  }

  function clearCanvas() {
    elements.value = []
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  // 持久化：画布尺寸、元件（含图片内容、文件名、填充方式）变化后写入 localStorage
  // 刷新页面或切换元件后再选回来，填充方式与图片状态均保留。
  // 防抖处理：拖拽/缩放时不会高频写入大体积的图片 data URL
  let saveTimer = null
  watch(
    [canvasWidth, canvasHeight, elements],
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            canvasWidth: canvasWidth.value,
            canvasHeight: canvasHeight.value,
            elementIdCounter,
            elements: elements.value
          }))
        } catch (err) {
          // 图片 data URL 体积较大，超出配额时给出明确提示
          console.warn('保存画布状态失败:', err)
        }
      }, 300)
    },
    { deep: true }
  )

  return {
    canvasWidth,
    canvasHeight,
    scale,
    elements,
    selectedElementId,
    selectedElementIds,
    canvasPixelWidth,
    canvasPixelHeight,
    selectedElement,
    selectedElements,
    setCanvasSize,
    setScale,
    addElement,
    updateElement,
    deleteElement,
    selectElement,
    clearSelection,
    alignElements,
    duplicateElement,
    clearCanvas,
    MM_TO_DOT
  }
})
