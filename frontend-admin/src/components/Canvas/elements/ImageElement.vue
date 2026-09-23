<template>
  <div class="image-element" @drop="handleDrop" @dragover.prevent>
    <img
      v-if="element.imageData"
      :src="element.imageData"
      :style="{ objectFit: objectFit }"
      alt="图片"
      draggable="false"
    />
    <div v-else class="placeholder" @click="triggerUpload">
      <el-icon :size="24"><Picture /></el-icon>
      <span>点击添加</span>
      <input ref="fileInput" type="file" accept="image/*" @change="handleFileChange" style="display: none" />
    </div>

    <!-- 图片加载慢时覆盖在该元件上，标明正在加载的是哪一张 -->
    <div v-if="loading" class="loading-mask">
      <el-icon class="is-loading" :size="20"><Loading /></el-icon>
      <span class="loading-name" :title="loading.name">加载中：{{ loading.name }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { loadElementImage, imageLoadingMap, imageFitToCss } from '@/utils/imageLoader'

const props = defineProps({ element: { type: Object, required: true } })
const store = useCanvasStore()
const fileInput = ref(null)

const objectFit = computed(() => imageFitToCss(props.element.imageFit))
const loading = computed(() => imageLoadingMap.get(props.element.id) || null)

const triggerUpload = () => {
  fileInput.value?.click()
}

const handleFileChange = (e) => {
  const file = e.target.files[0]
  // 清空 value：同一张图片可再次被选中（由加载器判断是否真的需要更换）；
  // 取消选择时 change 不触发，原有图片保持不变
  e.target.value = ''
  if (file) loadElementImage(store, props.element.id, file)
}

const handleDrop = (e) => {
  e.preventDefault()
  e.stopPropagation()
  const file = e.dataTransfer.files[0]
  if (file) loadElementImage(store, props.element.id, file)
}
</script>

<style scoped>
.image-element {
  width: 100%; height: 100%; overflow: hidden; background: #ffffff;
  border-radius: 2px; position: relative;
}
.image-element img { width: 100%; height: 100%; display: block; }
.placeholder {
  width: 100%; height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: #909399;
  gap: 4px; font-size: 11px; cursor: pointer; border: 1px dashed #dcdfe6;
  box-sizing: border-box;
}
.placeholder:hover { border-color: #409eff; color: #409eff; }

.loading-mask {
  position: absolute; inset: 0; z-index: 2;
  background: rgba(255, 255, 255, 0.8);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; color: #409eff; font-size: 11px; text-align: center; padding: 4px;
}
.loading-name {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
