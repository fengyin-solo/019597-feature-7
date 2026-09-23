import { reactive } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 各图片元件当前的加载状态：elementId -> { name }
 * 画布元件通过它显示“正在加载哪一张图片”的遮罩。
 */
export const imageLoadingMap = reactive(new Map())

// 每个图片元件一个加载令牌，保证慢加载时只有最后一次选择会生效
const loadTokens = new Map()

/**
 * 读取图片文件并写入元件。
 * - 取消选择（file 为空）时什么都不做，原有图片保留；
 * - 重复选择同一张图片（data URL 相同）时不改动内容；
 * - 加载慢时通过 imageLoadingMap 标识具体是哪一张；
 * - 后一次选择会使前一次尚未完成的加载失效，不会“回到上一张”。
 */
export const loadElementImage = (store, elementId, file) => {
  if (!file) return
  if (!file.type || !file.type.startsWith('image/')) {
    ElMessage.warning('请选择图片文件')
    return
  }

  const token = (loadTokens.get(elementId) || 0) + 1
  loadTokens.set(elementId, token)
  imageLoadingMap.set(elementId, { name: file.name })

  const finish = (clearLoading) => {
    if (loadTokens.get(elementId) === token && clearLoading) {
      imageLoadingMap.delete(elementId)
    }
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (loadTokens.get(elementId) !== token) return
    const dataUrl = reader.result

    // 先完整解码，确认图片可用、拿到真实尺寸后再提交，避免坏图替换掉原图
    const probe = new Image()
    probe.onload = () => {
      if (loadTokens.get(elementId) !== token) return
      imageLoadingMap.delete(elementId)

      const el = store.elements.find(item => item.id === elementId)
      if (!el) return
      if (el.imageData === dataUrl) {
        ElMessage.info(`图片「${file.name}」与当前图片相同，未更换`)
        return
      }
      store.updateElement(elementId, {
        imageData: dataUrl,
        imageName: file.name,
        imageFit: el.imageFit || 'contain'
      })
      ElMessage.success(`图片「${file.name}」加载完成`)
    }
    probe.onerror = () => {
      finish(true)
      ElMessage.error(`图片「${file.name}」加载失败，已保留原有图片`)
    }
    probe.src = dataUrl
  }
  reader.onerror = () => {
    finish(true)
    ElMessage.error(`图片「${file.name}」读取失败，已保留原有图片`)
  }
  reader.readAsDataURL(file)
}

/**
 * 填充方式与 CSS object-fit 的对应关系
 * contain: 等比适应（完整显示，留边）
 * cover:   铺满裁剪（填满元件框，居中裁切）
 * stretch: 拉伸（忽略宽高比，填满元件框）
 */
export const IMAGE_FIT_OPTIONS = [
  { value: 'contain', label: '等比适应' },
  { value: 'cover', label: '铺满裁剪' },
  { value: 'stretch', label: '拉伸' }
]

export const imageFitToCss = (fit) => {
  if (fit === 'cover') return 'cover'
  if (fit === 'stretch') return 'fill'
  return 'contain'
}

/**
 * 按填充方式计算图片在元件框内的绘制矩形（与 CSS object-fit 表现一致）。
 * 以图片真实宽高（naturalWidth/naturalHeight）为基准，
 * 小图放大时 contain / cover 仍保持原始宽高比，不会出现意外变形。
 * 返回 drawImage 九参数所需的 { sx, sy, sw, sh, dx, dy, dw, dh }。
 */
export const calcImageDrawRect = (imgW, imgH, boxW, boxH, fit) => {
  if (!imgW || !imgH || !boxW || !boxH) return null

  if (fit === 'stretch') {
    return { sx: 0, sy: 0, sw: imgW, sh: imgH, dx: 0, dy: 0, dw: boxW, dh: boxH }
  }

  const scale = fit === 'cover'
    ? Math.max(boxW / imgW, boxH / imgH)
    : Math.min(boxW / imgW, boxH / imgH)

  if (fit === 'cover') {
    // 放大到覆盖整个元件框，再从源图居中裁掉超出部分
    const sw = boxW / scale
    const sh = boxH / scale
    return {
      sx: (imgW - sw) / 2,
      sy: (imgH - sh) / 2,
      sw, sh,
      dx: 0, dy: 0, dw: boxW, dh: boxH
    }
  }

  // contain：完整显示，居中摆放，四周留边
  const dw = imgW * scale
  const dh = imgH * scale
  return {
    sx: 0, sy: 0, sw: imgW, sh: imgH,
    dx: (boxW - dw) / 2,
    dy: (boxH - dh) / 2,
    dw, dh
  }
}
