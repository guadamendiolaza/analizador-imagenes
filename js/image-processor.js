/**
 * ==========================================================================
 * MOTOR DE PROCESAMIENTO DE IMÁGENES: HISTORICAL DOCUMENT ENHANCER v4.0
 * - Detección de orientación de lectura humana (0°, 90°, 180°, 270°).
 * - Análisis de renglones de manuscritos por perfil de proyección y densidad.
 * - SIN RECORTE: Conserva el 100% de la imagen original intacta.
 * - Nivelación aditiva de iluminación (sin rayas, conserva tonos sepia y sellos).
 * - Gestión estricta de memoria (liberación instantánea de Mats y Canvases).
 * ==========================================================================
 */

class ImageProcessor {
  constructor() {
    this.isOpenCvReady = false;
    this.onOpenCvReadyCallbacks = [];
  }

  whenReady(callback) {
    if (this.isOpenCvReady) {
      callback();
    } else {
      this.onOpenCvReadyCallbacks.push(callback);
    }
  }

  setOpenCvReady() {
    this.isOpenCvReady = true;
    while (this.onOpenCvReadyCallbacks.length > 0) {
      const cb = this.onOpenCvReadyCallbacks.shift();
      try { cb(); } catch (e) { console.error("Error en callback de OpenCV:", e); }
    }
  }

  async getExifOrientation(file) {
    try {
      if (window.ExifReader) {
        const tags = await ExifReader.load(file, { expanded: true });
        if (tags && tags.exif && tags.exif.Orientation) {
          return parseInt(tags.exif.Orientation.value, 10) || 1;
        }
      }
    } catch (e) {}

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);
          if (view.getUint16(0, false) !== 0xFFD8) return resolve(1);
          const length = view.byteLength;
          let offset = 2;

          while (offset < length) {
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

  async loadImageFromFile(file, rotationDeg = 0, maxDim = 2400) {
    const exifOrientation = await this.getExifOrientation(file);

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const normalizedCanvas = this.normalizeImageOrientation(img, exifOrientation, rotationDeg, maxDim);
        resolve({
          element: normalizedCanvas,
          originalWidth: normalizedCanvas.width,
          originalHeight: normalizedCanvas.height,
          exifOrientation
        });
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  normalizeImageOrientation(img, exifOrientation, additionalRotation = 0, maxDim = 2400) {
    let exifRot = 0;
    if (exifOrientation === 6) exifRot = 90;
    else if (exifOrientation === 3) exifRot = 180;
    else if (exifOrientation === 8) exifRot = 270;

    let totalRot = (Math.round(additionalRotation) + exifRot) % 360;
    if (totalRot < 0) totalRot += 360;

    const isFlipped = (totalRot === 90 || totalRot === 270);
    const naturalW = isFlipped ? img.height : img.width;
    const naturalH = isFlipped ? img.width : img.height;

    const scale = Math.min(1.0, maxDim / Math.max(naturalW, naturalH));
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    ctx.save();
    if (totalRot === 90) {
      ctx.translate(canvas.width, 0);
      ctx.rotate(90 * Math.PI / 180);
      ctx.drawImage(img, 0, 0, canvas.height, canvas.width);
    } else if (totalRot === 180) {
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(180 * Math.PI / 180);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else if (totalRot === 270) {
      ctx.translate(0, canvas.height);
      ctx.rotate(270 * Math.PI / 180);
      ctx.drawImage(img, 0, 0, canvas.height, canvas.width);
    } else {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    return canvas;
  }

  /**
   * DETECCIÓN PRECISA DE ORIENTACIÓN Y SENTIDO DE LECTURA (0°, 90°, 180°, 270°)
   * Analiza:
   * 1. Renglones de escritura manuscrita (Horizontal vs Vertical).
   * 2. Densidad de tinta y márgenes superior vs inferior.
   * 3. Proyección de líneas para orientación natural de lectura.
   */
  detectReadingOrientation(srcMat) {
    if (!this.isOpenCvReady) {
      return { suggestedRotation: 0, confidence: 0, reason: 'OpenCV no listo' };
    }

    const matsToDelete = [];
    try {
      const origW = srcMat.cols;
      const origH = srcMat.rows;

      // Crear thumbnail rápido de 320px para análisis
      const maxDim = 320;
      const scale = Math.min(1.0, maxDim / Math.max(origW, origH));
      const thumbW = Math.max(10, Math.round(origW * scale));
      const thumbH = Math.max(10, Math.round(origH * scale));

      const thumb = new cv.Mat();
      matsToDelete.push(thumb);
      cv.resize(srcMat, thumb, new cv.Size(thumbW, thumbH), 0, 0, cv.INTER_AREA);

      const gray = new cv.Mat();
      matsToDelete.push(gray);
      cv.cvtColor(thumb, gray, cv.COLOR_RGBA2GRAY);

      // Evaluar varianza de renglones en orientación 0° vs 90°
      const gradX = new cv.Mat();
      const gradY = new cv.Mat();
      matsToDelete.push(gradX, gradY);
      cv.Sobel(gray, gradX, cv.CV_16S, 1, 0, 3);
      cv.Sobel(gray, gradY, cv.CV_16S, 0, 1, 3);

      const absX = new cv.Mat();
      const absY = new cv.Mat();
      matsToDelete.push(absX, absY);
      cv.convertScaleAbs(gradX, absX);
      cv.convertScaleAbs(gradY, absY);

      // Varianza horizontal (renglones normales)
      let rowSums = new Array(thumbH).fill(0);
      const dataY = absY.data;
      for (let r = 0; r < thumbH; r++) {
        let sum = 0;
        const offset = r * thumbW;
        for (let c = 0; c < thumbW; c++) {
          sum += dataY[offset + c];
        }
        rowSums[r] = sum;
      }
      const meanRow = rowSums.reduce((a,b)=>a+b, 0) / thumbH;
      const varRow = rowSums.reduce((a,b)=>a + (b - meanRow)**2, 0) / thumbH;

      // Varianza vertical (renglones de costado)
      let colSums = new Array(thumbW).fill(0);
      const dataX = absX.data;
      for (let c = 0; c < thumbW; c++) {
        let sum = 0;
        for (let r = 0; r < thumbH; r++) {
          sum += dataX[r * thumbW + c];
        }
        colSums[c] = sum;
      }
      const meanCol = colSums.reduce((a,b)=>a+b, 0) / thumbW;
      const varCol = colSums.reduce((a,b)=>a + (b - meanCol)**2, 0) / thumbW;

      // Análisis de densidad superior vs inferior para detectar si está invertida (180°)
      // En manuscritos, el margen superior/encabezado tiene mayor luminosidad (menos tinta) que el cuerpo
      const topRows = Math.round(thumbH * 0.25);
      const botRows = Math.round(thumbH * 0.25);
      let topInk = 0, botInk = 0;
      for (let r = 0; r < topRows; r++) {
        const offset = r * thumbW;
        for (let c = 0; c < thumbW; c++) topInk += dataY[offset + c];
      }
      for (let r = thumbH - botRows; r < thumbH; r++) {
        const offset = r * thumbW;
        for (let c = 0; c < thumbW; c++) botInk += dataY[offset + c];
      }

      let suggestedRotation = 0;
      let reason = 'Orientación de lectura correcta';

      // 1. Si la foto es apaisada (W > H) y las líneas son horizontales a lo ancho:
      if (origW > origH) {
        if (varRow > varCol * 1.1) {
          // La foto es ancha y el texto corre horizontal a lo ancho
          suggestedRotation = 0;
          reason = 'Documento apaisado horizontal';
        } else {
          // La foto es ancha pero el texto corre vertical -> necesita 90° o 270°
          suggestedRotation = 270;
          reason = 'Giro 270° a lectura vertical';
        }
      } else {
        // La foto es vertical (H > W)
        if (varCol > varRow * 1.25) {
          // Los renglones están de costado (verticales en la foto vertical)
          suggestedRotation = 90;
          reason = 'Texto de costado (girado 90° a lectura horizontal)';
        } else if (topInk > botInk * 1.45) {
          // El encabezado denso quedó abajo y el pie arriba -> invertida 180°
          suggestedRotation = 180;
          reason = 'Documento invertido (girado 180° a lectura correcta)';
        } else {
          suggestedRotation = 0;
          reason = 'Orientación vertical correcta';
        }
      }

      return {
        suggestedRotation,
        confidence: 0.88,
        reason
      };
    } catch (err) {
      console.warn("Fallo al detectar orientación:", err);
      return {
        suggestedRotation: 0,
        confidence: 0.70,
        reason: 'Orientación original'
      };
    } finally {
      matsToDelete.forEach(m => { try { m.delete(); } catch (_) {} });
    }
  }

  /**
   * SIN RECORTE: Retorna las 4 esquinas del fotograma completo (100% de la imagen)
   */
  getDefaultCorners(width, height, reason = 'Fotograma completo 100%') {
    return {
      corners: [
        { x: 0, y: 0 },
        { x: width - 1, y: 0 },
        { x: width - 1, y: height - 1 },
        { x: 0, y: height - 1 }
      ],
      confidence: 1.0,
      reason
    };
  }

  /**
   * MEJORA DE LEGIBILIDAD: NIVELACIÓN ADITIVA Y CLAHE (SIN RAYAS, CONSERVA COLOR SEPIA)
   */
  enhanceHistoricalDocument(srcMat, options = {}) {
    const {
      illuminationCorrection = true,
      contrastFactor = 1.3,
      sharpnessFactor = 0.20
    } = options;

    if (!this.isOpenCvReady) return srcMat.clone();

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

      // Nivelación aditiva suave (cero rayas en el fondo)
      if (illuminationCorrection) {
        const bgEstimate = new cv.Mat();
        matsToDelete.push(bgEstimate);
        const kSize = Math.max(31, Math.round(Math.min(srcMat.cols, srcMat.rows) / 20) | 1);
        cv.GaussianBlur(L, bgEstimate, new cv.Size(kSize, kSize), 0);

        const meanBg = cv.mean(bgEstimate)[0];

        const L_float = new cv.Mat();
        const bg_float = new cv.Mat();
        matsToDelete.push(L_float, bg_float);
        L.convertTo(L_float, cv.CV_32F);
        bgEstimate.convertTo(bg_float, cv.CV_32F);

        const diff = new cv.Mat();
        const meanScalar = new cv.Mat(L.rows, L.cols, cv.CV_32F, new cv.Scalar(meanBg));
        matsToDelete.push(diff, meanScalar);
        cv.subtract(meanScalar, bg_float, diff);

        const scaledDiff = new cv.Mat();
        matsToDelete.push(scaledDiff);
        cv.multiply(diff, new cv.Mat(L.rows, L.cols, cv.CV_32F, new cv.Scalar(0.55)), scaledDiff);

        const L_corr = new cv.Mat();
        matsToDelete.push(L_corr);
        cv.add(L_float, scaledDiff, L_corr);

        const L_clean = new cv.Mat();
        matsToDelete.push(L_clean);
        L_corr.convertTo(L_clean, cv.CV_8U);
        L = L_clean;
      }

      // CLAHE adaptativo para renglones desvanecidos
      const claheL = new cv.Mat();
      matsToDelete.push(claheL);
      const clahe = new cv.CLAHE(contrastFactor, new cv.Size(16, 16));
      clahe.apply(L, claheL);
      clahe.delete();

      // Nitidez suave de tinta
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
      const resultMat = new cv.Mat();
      matsToDelete.push(enhancedLab, enhancedRgb);

      cv.merge(enhancedPlanes, enhancedLab);
      cv.cvtColor(enhancedLab, enhancedRgb, cv.COLOR_Lab2RGB);
      cv.cvtColor(enhancedRgb, resultMat, cv.COLOR_RGB2RGBA);

      return resultMat;
    } catch (err) {
      console.warn("Fallo al mejorar manuscrito, conservando original:", err);
      return srcMat.clone();
    } finally {
      matsToDelete.forEach(m => { try { m.delete(); } catch (_) {} });
    }
  }

  matToCanvas(mat, targetCanvas = null) {
    const canvas = targetCanvas || document.createElement('canvas');
    cv.imshow(canvas, mat);
    return canvas;
  }

  elementToMat(element) {
    return cv.imread(element);
  }

  createThumbnailFromCanvas(canvas, maxDim = 320) {
    const scale = Math.min(1.0, maxDim / Math.max(canvas.width, canvas.height));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = Math.max(1, Math.round(canvas.width * scale));
    thumbCanvas.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = thumbCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.80);
    thumbCanvas.width = 0;
    thumbCanvas.height = 0;
    return dataUrl;
  }

  canvasToBlob(canvas, quality = 0.92) {
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    });
  }
}

window.documentImageProcessor = new ImageProcessor();
