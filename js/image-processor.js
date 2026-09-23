/**
 * ==========================================================================
 * MOTOR DE PROCESAMIENTO: HISTORICAL DOCUMENT ENHANCER v5.0
 * CORRECCIONES:
 *   - Detección de orientación por GEOMETRÍA TRAPEZOIDAL pura (sin OpenCV).
 *     Regla física: el borde MÁS ANCHO de la hoja va abajo (perspectiva).
 *   - Fuga de memoria OpenCV eliminada: cv.addWeighted reemplaza la
 *     creación de cv.Mat anónimos (eran la causa de los 135 errores).
 *   - Fallback puro de Canvas si OpenCV falla en cualquier imagen.
 *   - SIN RECORTE: el 100% del fotograma se conserva siempre.
 * ==========================================================================
 */

class ImageProcessor {
  constructor() {
    this.isOpenCvReady = false;
    this.onOpenCvReadyCallbacks = [];
  }

  whenReady(callback) {
    if (this.isOpenCvReady) callback();
    else this.onOpenCvReadyCallbacks.push(callback);
  }

  setOpenCvReady() {
    this.isOpenCvReady = true;
    while (this.onOpenCvReadyCallbacks.length > 0) {
      const cb = this.onOpenCvReadyCallbacks.shift();
      try { cb(); } catch (e) { console.error(e); }
    }
  }

  // ========= LECTURA DE EXIF =========
  async getExifOrientation(file) {
    try {
      if (window.ExifReader) {
        const tags = await ExifReader.load(file, { expanded: true });
        if (tags?.exif?.Orientation) {
          return parseInt(tags.exif.Orientation.value, 10) || 1;
        }
      }
    } catch (_) {}

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);
          if (view.getUint16(0, false) !== 0xFFD8) return resolve(1);
          let offset = 2;
          while (offset < view.byteLength) {
            if (view.getUint16(offset + 2, false) <= 0) break;
            const marker = view.getUint16(offset, false);
            offset += 2;
            if (marker === 0xFFE1) {
              if (view.getUint32(offset += 2, false) !== 0x45786966) return resolve(1);
              const little = view.getUint16(offset += 6, false) === 0x4949;
              offset += view.getUint32(offset + 4, little);
              const tags = view.getUint16(offset, little);
              offset += 2;
              for (let i = 0; i < tags; i++) {
                if (view.getUint16(offset + (i * 12), little) === 0x0112) {
                  return resolve(view.getUint16(offset + (i * 12) + 8, little));
                }
              }
            } else if ((marker & 0xFF00) !== 0xFF00) {
              break;
            } else {
              offset += view.getUint16(offset, false);
            }
          }
        } catch (_) {}
        resolve(1);
      };
      reader.onerror = () => resolve(1);
      reader.readAsArrayBuffer(file.slice(0, 65536));
    });
  }

  // ========= CARGA Y NORMALIZACIÓN =========
  async loadImageFromFile(file, rotationDeg = 0, maxDim = 2200) {
    const exifOrientation = await this.getExifOrientation(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = this.normalizeImageOrientation(img, exifOrientation, rotationDeg, maxDim);
        resolve({ element: canvas, originalWidth: canvas.width, originalHeight: canvas.height, exifOrientation });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')); };
      img.src = url;
    });
  }

  normalizeImageOrientation(img, exifOrientation, additionalRotation = 0, maxDim = 2200) {
    let exifRot = 0;
    if (exifOrientation === 6) exifRot = 90;
    else if (exifOrientation === 3) exifRot = 180;
    else if (exifOrientation === 8) exifRot = 270;

    let totalRot = (Math.round(additionalRotation) + exifRot) % 360;
    if (totalRot < 0) totalRot += 360;

    const flipped = (totalRot === 90 || totalRot === 270);
    const natW = flipped ? img.height : img.width;
    const natH = flipped ? img.width : img.height;

    const scale = Math.min(1.0, maxDim / Math.max(natW, natH));
    const tw = Math.max(1, Math.round(natW * scale));
    const th = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');

    ctx.save();
    if (totalRot === 90) {
      ctx.translate(tw, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, th, tw);
    } else if (totalRot === 180) {
      ctx.translate(tw, th);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0, tw, th);
    } else if (totalRot === 270) {
      ctx.translate(0, th);
      ctx.rotate(3 * Math.PI / 2);
      ctx.drawImage(img, 0, 0, th, tw);
    } else {
      ctx.drawImage(img, 0, 0, tw, th);
    }
    ctx.restore();
    return canvas;
  }

  // ========= DETECCIÓN DE ORIENTACIÓN — 100% CANVAS, SIN OPENCV =========
  /**
   * Regla física de perspectiva: cuando se fotografía una hoja sobre una mesa,
   * el borde MÁS CERCANO a la cámara (parte INFERIOR del documento) siempre
   * aparece MÁS ANCHO en la foto que el borde superior (más lejano, más estrecho).
   *
   * Si el borde SUPERIOR de la foto es MÁS ANCHO que el inferior → hoja está
   * INVERTIDA → necesita 180°.
   *
   * Para imágenes apaisadas (W > H): medir ancho en lados izquierdo y derecho.
   */
  detectReadingOrientationPure(canvas) {
    const AW = 240;
    const AH = Math.max(1, Math.round(canvas.height * AW / canvas.width));

    // Crear canvas de análisis temporal
    const sCanvas = document.createElement('canvas');
    sCanvas.width = AW;
    sCanvas.height = AH;
    const sCtx = sCanvas.getContext('2d');
    sCtx.drawImage(canvas, 0, 0, AW, AH);

    let px;
    try {
      px = sCtx.getImageData(0, 0, AW, AH).data;
    } catch (_) {
      sCanvas.width = 0; sCanvas.height = 0;
      return 0;
    }
    sCanvas.width = 0; sCanvas.height = 0;

    // Calcular brillo de cada pixel
    const brightness = new Float32Array(AW * AH);
    let maxBr = 0;
    for (let i = 0; i < AW * AH; i++) {
      const pi = i * 4;
      const br = px[pi] * 0.299 + px[pi + 1] * 0.587 + px[pi + 2] * 0.114;
      brightness[i] = br;
      if (br > maxBr) maxBr = br;
    }

    // Si la imagen es casi negra, no detectar
    if (maxBr < 60) return 0;

    // Umbral adaptativo: 55% del máximo (detecta papel vs fondo oscuro)
    const THRESH = Math.max(90, maxBr * 0.55);

    // Función auxiliar: span promedio de pixels brillantes en un rango de filas o columnas
    const rowSpan = (y0, y1) => {
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        let left = AW, right = -1;
        for (let x = 0; x < AW; x++) {
          if (brightness[y * AW + x] >= THRESH) {
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
        if (right > left) { sum += right - left; n++; }
      }
      return n > 0 ? sum / n : AW * 0.5;
    };

    const colSpan = (x0, x1) => {
      let sum = 0, n = 0;
      for (let x = x0; x < x1; x++) {
        let top = AH, bot = -1;
        for (let y = 0; y < AH; y++) {
          if (brightness[y * AW + x] >= THRESH) {
            if (y < top) top = y;
            if (y > bot) bot = y;
          }
        }
        if (bot > top) { sum += bot - top; n++; }
      }
      return n > 0 ? sum / n : AH * 0.5;
    };

    const isLandscape = canvas.width > canvas.height;

    if (isLandscape) {
      // Imagen apaisada: medir span vertical en franja izquierda vs derecha
      const leftH  = colSpan(0, Math.round(AW * 0.25));
      const rightH = colSpan(Math.round(AW * 0.75), AW);

      // El lado más ALTO es la parte LEJANA de la cámara (TOP del documento)
      // El lado más corto es la parte CERCANA (BOTTOM del documento)
      // → el borde más corto debe ir abajo
      // Después de rotar 90° CW: el lado derecho va abajo
      // Después de rotar 270° CW: el lado izquierdo va abajo

      if (leftH > rightH * 1.10) {
        // Lado izquierdo es más alto → left es el TOP → right va abajo → rotar 90° CW
        return 90;
      } else if (rightH > leftH * 1.10) {
        // Lado derecho es más alto → right es el TOP → left va abajo → rotar 270° CW
        return 270;
      }
      // Ambiguo: default 270° para fotos de móvil
      return 270;
    }

    // Imagen vertical (portrait): medir span horizontal en franja superior vs inferior
    const topBandEnd  = Math.round(AH * 0.25);
    const botBandStart = Math.round(AH * 0.75);

    const topW = rowSpan(0, topBandEnd);
    const botW = rowSpan(botBandStart, AH);

    // Si el borde SUPERIOR es claramente MÁS ANCHO que el inferior:
    // → la hoja está invertida → necesita 180°
    // Umbral conservador del 10% para evitar falsos positivos
    if (topW > botW * 1.10) {
      return 180;
    }

    return 0; // correcto como está
  }

  // ========= MEJORA OPENCVO: CLAHE + NIVELACIÓN SIN FUGA DE MEMORIA =========
  /**
   * CORRECCIÓN CRÍTICA DE MEMORIA:
   * Se reemplazó cv.multiply(diff, new cv.Mat(...), scaledDiff) por cv.addWeighted().
   * Cada imagen leakaba 7.68MB de heap WASM → a las ~120 fotos el heap colapsaba.
   * cv.addWeighted computa lo mismo sin crear matrices intermedias anónimas.
   */
  enhanceHistoricalDocument(srcMat, options = {}) {
    const {
      illuminationCorrection = true,
      contrastFactor = 1.3,
      sharpnessFactor = 0.20
    } = options;

    if (!this.isOpenCvReady) throw new Error('OpenCV no listo');

    const matsToDelete = [];
    try {
      const rgbMat = new cv.Mat();
      matsToDelete.push(rgbMat);
      cv.cvtColor(srcMat, rgbMat, cv.COLOR_RGBA2RGB);

      const labMat = new cv.Mat();
      matsToDelete.push(labMat);
      cv.cvtColor(rgbMat, labMat, cv.COLOR_RGB2Lab);

      const labPlanes = new cv.MatVector();
      matsToDelete.push(labPlanes);
      cv.split(labMat, labPlanes);

      let L = labPlanes.get(0);
      const A = labPlanes.get(1);
      const B = labPlanes.get(2);
      matsToDelete.push(L, A, B);

      if (illuminationCorrection) {
        // Calcular kernel siempre impar y dentro de límites razonables
        let kSize = Math.round(Math.min(srcMat.cols, srcMat.rows) / 20);
        if (kSize % 2 === 0) kSize++;
        kSize = Math.max(11, Math.min(151, kSize));

        const bgEstimate = new cv.Mat();
        matsToDelete.push(bgEstimate);
        cv.GaussianBlur(L, bgEstimate, new cv.Size(kSize, kSize), 0);

        const meanBg = cv.mean(bgEstimate)[0];

        const L_float = new cv.Mat();
        const bg_float = new cv.Mat();
        const L_corr  = new cv.Mat();
        matsToDelete.push(L_float, bg_float, L_corr);
        L.convertTo(L_float, cv.CV_32F);
        bgEstimate.convertTo(bg_float, cv.CV_32F);

        // FIX CLAVE: antes se hacía cv.multiply(diff, new cv.Mat(...)) → FUGA de 7.68MB/foto.
        // Ahora: L_corr = 1.0 * L_float + (-0.55) * bg_float + 0.55 * meanBg
        // Equivale a: L_corr = L_float + 0.55 * (meanBg - bgEstimate) → SIN FUGA.
        cv.addWeighted(L_float, 1.0, bg_float, -0.55, 0.55 * meanBg, L_corr);

        const L_clean = new cv.Mat();
        matsToDelete.push(L_clean);
        L_corr.convertTo(L_clean, cv.CV_8U);
        L = L_clean;
      }

      // CLAHE para realzar contraste local (renglones desvanecidos)
      const claheL = new cv.Mat();
      matsToDelete.push(claheL);
      const clahe = new cv.CLAHE(Math.max(1.0, contrastFactor), new cv.Size(16, 16));
      clahe.apply(L, claheL);
      clahe.delete();

      // Nitidez suave
      const sharpL = new cv.Mat();
      matsToDelete.push(sharpL);
      if (sharpnessFactor > 0) {
        const blurSmall = new cv.Mat();
        matsToDelete.push(blurSmall);
        cv.GaussianBlur(claheL, blurSmall, new cv.Size(3, 3), 0);
        cv.addWeighted(claheL, 1.0 + sharpnessFactor, blurSmall, -sharpnessFactor, 0, sharpL);
      } else {
        claheL.copyTo(sharpL);
      }

      const enhancedPlanes = new cv.MatVector();
      enhancedPlanes.push_back(sharpL);
      enhancedPlanes.push_back(A);
      enhancedPlanes.push_back(B);
      matsToDelete.push(enhancedPlanes);

      const enhancedLab = new cv.Mat();
      const enhancedRgb = new cv.Mat();
      const resultMat   = new cv.Mat();
      matsToDelete.push(enhancedLab, enhancedRgb);

      cv.merge(enhancedPlanes, enhancedLab);
      cv.cvtColor(enhancedLab, enhancedRgb, cv.COLOR_Lab2RGB);
      cv.cvtColor(enhancedRgb, resultMat, cv.COLOR_RGB2RGBA);

      return resultMat;
    } catch (err) {
      console.warn('OpenCV enhancement failed:', err.message || err);
      throw err; // re-throw para que app.js use el fallback Canvas
    } finally {
      matsToDelete.forEach(m => { try { m.delete(); } catch (_) {} });
    }
  }

  // ========= MEJORA ALTERNATIVA 100% CANVAS (FALLBACK SIN OPENCV) =========
  enhanceCanvasOnly(canvas, options = {}) {
    const { contrastFactor = 1.3, sharpnessFactor = 0.20 } = options;

    const W = canvas.width;
    const H = canvas.height;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = W;
    outCanvas.height = H;
    const ctx = outCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    let imgData;
    try {
      imgData = ctx.getImageData(0, 0, W, H);
    } catch (_) {
      return outCanvas; // si falla incluso getImageData, devolver copia
    }
    const data = imgData.data;

    // Construir histograma de luminancia
    const hist = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      hist[Math.min(255, Math.max(0, lum))]++;
    }

    // Encontrar percentil 2% y 98%
    const nPx = W * H;
    let cumul = 0, lo = 0, hi = 255;
    for (let b = 0; b < 256; b++) {
      cumul += hist[b];
      if (cumul < nPx * 0.02) lo = b;
      if (cumul < nPx * 0.97) hi = b;
    }

    const range = Math.max(1, hi - lo);
    // Aplicar stretch de contraste preservando color
    for (let i = 0; i < data.length; i += 4) {
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const lumNew = Math.max(0, Math.min(255, (lum - lo) / range * 255));
      const s = lum > 2 ? lumNew / lum : 1;
      data[i]     = Math.min(255, Math.round(data[i]     * s));
      data[i + 1] = Math.min(255, Math.round(data[i + 1] * s));
      data[i + 2] = Math.min(255, Math.round(data[i + 2] * s));
    }

    // Nitidez suave si se requiere (solo en Canvas, no aplica blur completo para ahorrar tiempo)
    if (sharpnessFactor > 0.1) {
      // Aplicar leve boost de contraste adicional
      const boost = 1 + sharpnessFactor * 0.5;
      const mid = 128;
      for (let i = 0; i < data.length; i += 4) {
        data[i]     = Math.min(255, Math.max(0, Math.round(mid + (data[i]     - mid) * boost)));
        data[i + 1] = Math.min(255, Math.max(0, Math.round(mid + (data[i + 1] - mid) * boost)));
        data[i + 2] = Math.min(255, Math.max(0, Math.round(mid + (data[i + 2] - mid) * boost)));
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return outCanvas;
  }

  // ========= UTILIDADES =========
  matToCanvas(mat) {
    const canvas = document.createElement('canvas');
    cv.imshow(canvas, mat);
    return canvas;
  }

  elementToMat(element) {
    return cv.imread(element);
  }

  createThumbnailFromCanvas(canvas, maxDim = 320) {
    const scale = Math.min(1.0, maxDim / Math.max(canvas.width, canvas.height));
    const tw = Math.max(1, Math.round(canvas.width  * scale));
    const th = Math.max(1, Math.round(canvas.height * scale));
    const t = document.createElement('canvas');
    t.width = tw; t.height = th;
    t.getContext('2d').drawImage(canvas, 0, 0, tw, th);
    const url = t.toDataURL('image/jpeg', 0.78);
    t.width = 0; t.height = 0;
    return url;
  }

  canvasToBlob(canvas, quality = 0.92) {
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    });
  }
}

window.documentImageProcessor = new ImageProcessor();
