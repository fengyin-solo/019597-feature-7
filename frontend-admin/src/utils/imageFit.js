// 图片填充方式：contain 等比适应 / cover 铺满裁剪 / stretch 拉伸
export const FIT_MODES = {
  CONTAIN: 'contain',
  COVER: 'cover',
  STRETCH: 'stretch'
}

export const DEFAULT_FIT_MODE = FIT_MODES.CONTAIN

export function normalizeFitMode(mode) {
  return Object.values(FIT_MODES).includes(mode) ? mode : DEFAULT_FIT_MODE
}

// 元件框的背景色，与画布上图片元件的背景保持一致（导出时留白处也用同一颜色）
export const IMAGE_PLACEHOLDER_BG = '#f5f7fa'

/**
 * 依据填充方式计算图片绘制到元件框内的目标矩形，
 * 计算只使用图片真实的 naturalWidth/naturalHeight，
 * 因此不同格式、本身比框小很多的图片放大后也不会出现意料之外的变形。
 *
 * @returns {{ dx: number, dy: number, dw: number, dh: number }}
 */
export function calcImageRect(img, boxW, boxH, mode) {
  const iw = img.naturalWidth || img.width || 0
  const ih = img.naturalHeight || img.height || 0
  if (!iw || !ih || !boxW || !boxH) return { dx: 0, dy: 0, dw: boxW, dh: boxH }

  switch (normalizeFitMode(mode)) {
    case FIT_MODES.STRETCH:
      // 用户明确选择拉伸，填满整个框
      return { dx: 0, dy: 0, dw: boxW, dh: boxH }
    case FIT_MODES.COVER: {
      // 等比放大至完全覆盖，居中后超出部分由调用方裁剪
      const scale = Math.max(boxW / iw, boxH / ih)
      const dw = iw * scale
      const dh = ih * scale
      return { dx: (boxW - dw) / 2, dy: (boxH - dh) / 2, dw, dh }
    }
    case FIT_MODES.CONTAIN:
    default: {
      // 等比缩放至完整显示，居中留边
      const scale = Math.min(boxW / iw, boxH / ih)
      const dw = iw * scale
      const dh = ih * scale
      return { dx: (boxW - dw) / 2, dy: (boxH - dh) / 2, dw, dh }
    }
  }
}

// 文件签名：同名同大小同修改时间视为同一张图片（重复挑选时不改变原有内容）
export function fileSignature(file) {
  return `${file.name}__${file.size}__${file.lastModified}`
}

/**
 * 读取并校验一张图片，成功后解析出 HTMLImageElement。
 * 不同格式（bmp/gif/png/...）交给浏览器原生解码，尺寸一律以 naturalWidth/Height 为准。
 */
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const img = new Image()
      img.onload = () => resolve({ img, dataUrl })
      img.onerror = () => reject(new Error('图片解码失败'))
      img.src = dataUrl
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

// 判断新文件与元件当前图片是否为同一张（同一文件再次被挑中时签名一致）
export function isSameImage(file, element) {
  return Boolean(element && element.imageData && element.imageFile &&
    element.imageFile.signature === fileSignature(file))
}
