<template>
  <div class="image-element" @drop="handleDrop" @dragover.prevent>
    <template v-if="element.imageData || loadingState">
      <img
        v-if="element.imageData"
        :src="element.imageData"
        alt="图片"
        :style="{ objectFit: fitMode }"
        draggable="false"
      />
      <!-- 图片加载慢时，遮罩标明当前是哪一张 -->
      <div v-if="loadingState" class="image-loading-mask">
        <el-icon class="is-loading" :size="20"><Loading /></el-icon>
        <span class="loading-text">图片加载中…</span>
        <span class="loading-name" :title="loadingState.fileName">{{ loadingState.fileName }}</span>
      </div>
    </template>
    <div v-else class="placeholder" @click="triggerUpload">
      <el-icon :size="24"><Picture /></el-icon>
      <span>点击添加</span>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden-file-input"
      @click="handleInputClick"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { ElMessage } from 'element-plus'
import { normalizeFitMode } from '@/utils/imageFit'

const props = defineProps({ element: { type: Object, required: true } })
const store = useCanvasStore()
const fileInput = ref(null)

// 填充方式保存在元件数据上，切换元件、刷新后都还是当前选择
const fitMode = computed(() => normalizeFitMode(props.element.fitMode))
const loadingState = computed(() => store.imageLoadingMap[props.element.id] || null)

const triggerUpload = () => {
  fileInput.value?.click()
}

// 每次打开选择框前清空 value：这样即使重复挑中同一个文件也会触发 change
const handleInputClick = (e) => {
  e.target.value = ''
}

const handleFileChange = async (e) => {
  const file = e.target.files[0]
  // 点击“添加”后又取消：不改变原有内容
  if (!file) return
  const result = await store.assignImageFile(props.element.id, file)
  if (result === 'ok') ElMessage.success('图片已加载')
  else if (result === 'same') ElMessage.info('与当前图片相同，未更换')
  else if (result === 'failed') ElMessage.error('图片加载失败')
  else ElMessage.warning('请选择有效的图片文件')
}

const handleDrop = (e) => {
  e.preventDefault()
  e.stopPropagation()
  const file = e.dataTransfer.files[0]
  if (file && file.type.startsWith('image/')) {
    store.assignImageFile(props.element.id, file).then((result) => {
      if (result === 'ok') ElMessage.success('图片已加载')
      else if (result === 'same') ElMessage.info('与当前图片相同，未更换')
      else if (result === 'failed') ElMessage.error('图片加载失败')
    })
  }
}
</script>

<style scoped>
.image-element {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f5f7fa;
  border-radius: 2px;
  position: relative;
}
.image-element img {
  width: 100%;
  height: 100%;
  display: block;
  /* 默认等比适应；铺满裁剪、拉伸由内联 object-fit 控制，小图放大也不会意外变形 */
  object-fit: contain;
}
.placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  gap: 4px;
  font-size: 11px;
  cursor: pointer;
  border: 1px dashed #dcdfe6;
  box-sizing: border-box;
}
.placeholder:hover { border-color: #409eff; color: #409eff; }

.hidden-file-input { display: none; }

.image-loading-mask {
  position: absolute;
  inset: 0;
  background: rgba(245, 247, 250, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #409eff;
  font-size: 11px;
  text-align: center;
  padding: 4px;
  box-sizing: border-box;
}
.image-loading-mask .loading-name {
  max-width: 100%;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
