import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import {
  DEFAULT_FIT_MODE,
  normalizeFitMode,
  fileSignature,
  readImageFile,
  isSameImage
} from '@/utils/imageFit'

const MM_TO_DOT = 8
const STORAGE_KEY = 'label-editor-state'
const PERSIST_DEBOUNCE = 400

export const useCanvasStore = defineStore('canvas', () => {
  const canvasWidth = ref(80)
  const canvasHeight = ref(60)
  const scale = ref(1)
  const elements = ref([])
  const selectedElementId = ref(null)
  const selectedElementIds = ref([])
  let elementIdCounter = 0

  // 每个图片元件的加载状态：{ [elementId]: { loading: true, fileName } }
  // 加载状态属于临时 UI 状态，不做持久化
  const imageLoadingMap = ref({})
  // 按元件记录图片分配序列号：同一元件上后发起的加载序号更大，
  // 先发起的慢加载完成后不得回写；不同元件互不影响
  const imageAssignSeqMap = new Map()
  // 各元件当前加载中的 Promise，导出前等待用
  const pendingImagePromises = new Map()

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
    // 填充方式跟着元件一起保存；旧数据/缺省值统一兜底为等比适应
    if (newElement.type === 'image') {
      newElement.fitMode = normalizeFitMode(newElement.fitMode)
      newElement.imageData = newElement.imageData || null
      newElement.imageFile = newElement.imageFile || null
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
      pendingImagePromises.delete(id)
      imageAssignSeqMap.delete(id)
      delete imageLoadingMap.value[id]
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
    pendingImagePromises.clear()
    imageLoadingMap.value = {}
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  /**
   * 给图片元件分配新图片（画布占位点击、拖拽、属性面板选择都走这里）。
   * - 取消选择（无文件）：保持原样
   * - 与当前图片是同一张：不改变内容
   * - 连续更换时以序列号兜底，慢加载完成的旧图片不会覆盖新图片
   *
   * @returns {'ok'|'same'|'invalid'|'failed'}
   */
  async function assignImageFile(id, file) {
    if (!file) return 'invalid'
    if (!file.type || !file.type.startsWith('image/')) return 'invalid'

    const element = elements.value.find(el => el.id === id)
    if (!element) return 'invalid'

    if (isSameImage(file, element)) return 'same'

    const seq = (imageAssignSeqMap.get(id) || 0) + 1
    imageAssignSeqMap.set(id, seq)
    const signature = fileSignature(file)
    const fileName = file.name
    imageLoadingMap.value = { ...imageLoadingMap.value, [id]: { loading: true, fileName } }

    const promise = readImageFile(file)
      .then(({ dataUrl }) => {
        // 序列号更小说明这是该元件上已被取代的旧加载，丢弃结果（不回到上一次的图片）
        if (seq !== imageAssignSeqMap.get(id)) return 'superseded'
        updateElement(id, {
          imageData: dataUrl,
          imageFile: { name: fileName, signature },
          fitMode: normalizeFitMode(elements.value.find(el => el.id === id)?.fitMode)
        })
        return 'ok'
      })
      .catch((err) => {
        if (seq === imageAssignSeqMap.get(id)) console.error('图片加载失败:', err)
        return seq === imageAssignSeqMap.get(id) ? 'failed' : 'superseded'
      })
      .finally(() => {
        // 仅当等待表里还是自己时才移除，避免旧加载删掉新加载的条目
        if (pendingImagePromises.get(id) === promise) pendingImagePromises.delete(id)
        if (seq === imageAssignSeqMap.get(id)) {
          const next = { ...imageLoadingMap.value }
          delete next[id]
          imageLoadingMap.value = next
        }
      })

    pendingImagePromises.set(id, promise)
    return promise
  }

  // 等待指定元件（或全部）图片加载完成，保证导出时不丢正在加载的图片
  async function whenImagesSettled(id = null) {
    const promises = id
      ? [pendingImagePromises.get(id)].filter(Boolean)
      : [...pendingImagePromises.values()]
    if (promises.length) await Promise.allSettled(promises)
  }

  // ---------- 持久化：填充方式、图片等状态随元件一起保留，刷新后仍在 ----------
  let persistTimer = null
  function persistState() {
    try {
      const data = {
        canvasWidth: canvasWidth.value,
        canvasHeight: canvasHeight.value,
        elements: elements.value,
        selectedElementId: selectedElementId.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (err) {
      // dataURL 较大时可能超出 localStorage 配额，静默降级为本次会话内有效
      console.warn('画布状态保存失败：', err)
    }
  }

  function restoreState() {
    let raw
    try {
      raw = localStorage.getItem(STORAGE_KEY)
    } catch {
      raw = null
    }
    if (!raw) return
    try {
      const data = JSON.parse(raw)
      if (typeof data.canvasWidth === 'number') canvasWidth.value = data.canvasWidth
      if (typeof data.canvasHeight === 'number') canvasHeight.value = data.canvasHeight
      if (Array.isArray(data.elements)) {
        elements.value = data.elements.map(el => {
          if (el.type === 'image') {
            return {
              ...el,
              fitMode: normalizeFitMode(el.fitMode),
              imageData: el.imageData || null,
              imageFile: el.imageFile || null
            }
          }
          return el
        })
        let maxNum = 0
        elements.value.forEach(el => {
          const num = Number(String(el.id).replace('element_', ''))
          if (Number.isFinite(num)) maxNum = Math.max(maxNum, num)
        })
        elementIdCounter = maxNum
        const existsId = data.selectedElementId &&
          elements.value.some(el => el.id === data.selectedElementId)
        if (existsId) {
          selectedElementId.value = data.selectedElementId
          selectedElementIds.value = [data.selectedElementId]
        } else if (elements.value.length > 0) {
          selectedElementId.value = elements.value[elements.value.length - 1].id
          selectedElementIds.value = [selectedElementId.value]
        }
      }
    } catch (err) {
      console.warn('画布状态恢复失败：', err)
    }
  }

  watch(
    [canvasWidth, canvasHeight, elements, selectedElementId],
    () => {
      clearTimeout(persistTimer)
      persistTimer = setTimeout(persistState, PERSIST_DEBOUNCE)
    },
    { deep: true }
  )

  restoreState()

  return {
    canvasWidth,
    canvasHeight,
    scale,
    elements,
    selectedElementId,
    selectedElementIds,
    imageLoadingMap,
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
    assignImageFile,
    whenImagesSettled,
    MM_TO_DOT,
    DEFAULT_FIT_MODE
  }
})
