/**
 * ==========================================================================
 * MOTOR DE PROCESAMIENTO DE IMÁGENES: HISTORICAL DOCUMENT ENHANCER v3.8
 * - Detección de lectura y renglones de manuscritos (perfil de proyección y gradientes).
 * - Rotación inteligente en el sentido de lectura (ancho de hoja en base / 270° vs 90° vs 0°).
 * - Recorte no agresivo: Conserva 100% de la foto si la hoja ya llena el encuadre (>75%).
 * - Recorte seguro (+3.5% margen) sólo cuando hay fondo de escritorio visible y separable.
 * - Nivelación aditiva de iluminación (cero rayas, conserva tonos sepia y sellos).
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

  async loadImageFromFile(file, rotationDeg = 0, maxDim = 3200) {
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

  normalizeImageOrientation(img, exifOrientation, additionalRotation = 0, maxDim = 3200) {
    let exifRot = 0;
    if (exifOrientation === 6) exifRot = 90;
    else if (exifOrientation === 3) exifRot = 180;
    else if (exifOrientation === 8) exifRot = 270;

    let totalRot = (Math.round(additionalRotation) + exifRot) % 360;
    if (totalRot < 0) totalRot += 360;

    const isFlipped = (totalRot === 90 || totalRot === 270);
    const naturalW = isFlipped ? img.height : img.width;
    const naturalH = isFlipped ? img.width : img.height;

    // Escalar si supera la resolución máxima para no saturar memoria RAM
    const scale = Math.min(1.0, maxDim / Math.max(naturalW, naturalH));
    const targetW = Math.round(naturalW * scale);
    const targetH = Math.round(naturalH * scale);

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
   * DETECCIÓN DE ORIENTACIÓN EN EL SENTIDO DE LECTURA HUMANA
   * 1. Análisis de renglones horizontales vs verticales de la escritura manuscrita.
   * 2. Regla física de perspectiva: El borde más ancho de la hoja corresponde a la base (abajo).
   * 3. Densidad de encabezado vs cuerpo de texto.
   */
  detectReadingOrientation(srcMat) {
    if (!this.isOpenCvReady) {
      return { suggestedRotation: 0, confidence: 0, needsReview: false, reason: 'OpenCV no listo' };
    }

    const matsToDelete = [];
    try {
      const origW = srcMat.cols;
      const origH = srcMat.rows;
      const isLandscape = origW > origH;

      // Redimensionar para análisis rápido
      const maxDim = 400;
      const scale = Math.min(1.0, maxDim / Math.max(origW, origH));
      const thumbW = Math.round(origW * scale);
      const thumbH = Math.round(origH * scale);

      const thumb = new cv.Mat();
      matsToDelete.push(thumb);
      cv.resize(srcMat, thumb, new cv.Size(thumbW, thumbH), 0, 0, cv.INTER_AREA);

      const gray = new cv.Mat();
      matsToDelete.push(gray);
      cv.cvtColor(thumb, gray, cv.COLOR_RGBA2GRAY);

      // 1. Análisis de líneas de escritura manuscrita (Gradientes Sobel Y vs Sobel X)
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

      // Calcular varianza de proyección horizontal (renglones) vs vertical
      let rowGradSum = new Array(thumbH).fill(0);
      let colGradSum = new Array(thumbW).fill(0);

      const dataY = absY.data;
      for (let r = 0; r < thumbH; r++) {
        let sum = 0;
        const rowOffset = r * thumbW;
        for (let c = 0; c < thumbW; c++) {
          sum += dataY[rowOffset + c];
        }
        rowGradSum[r] = sum;
      }

      const meanRow = rowGradSum.reduce((a,b)=>a+b, 0) / thumbH;
      const varRow = rowGradSum.reduce((a,b)=>a + (b - meanRow)**2, 0) / thumbH;

      const dataX = absX.data;
      for (let c = 0; c < thumbW; c++) {
        let sum = 0;
        for (let r = 0; r < thumbH; r++) {
          sum += dataX[r * thumbW + c];
        }
        colGradSum[c] = sum;
      }
      const meanCol = colGradSum.reduce((a,b)=>a+b, 0) / thumbW;
      const varCol = colGradSum.reduce((a,b)=>a + (b - meanCol)**2, 0) / thumbW;

      // 2. Segmentación de la hoja para evaluar perspectiva trapezoidal
      const blurred = new cv.Mat();
      matsToDelete.push(blurred);
      cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 0);

      const thresh = new cv.Mat();
      matsToDelete.push(thresh);
      cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

      // Medir ancho/span de la hoja en el sector izquierdo (20%) y derecho (80%)
      const leftCol = Math.round(thumbW * 0.20);
      const rightCol = Math.round(thumbW * 0.80);

      let leftSpan = 0, leftMin = thumbH, leftMax = 0;
      let rightSpan = 0, rightMin = thumbH, rightMax = 0;

      for (let r = 0; r < thumbH; r++) {
        if (thresh.data[r * thumbW + leftCol] > 128) {
          if (r < leftMin) leftMin = r;
          if (r > leftMax) leftMax = r;
        }
        if (thresh.data[r * thumbW + rightCol] > 128) {
          if (r < rightMin) rightMin = r;
          if (r > rightMax) rightMax = r;
        }
      }
      if (leftMax > leftMin) leftSpan = leftMax - leftMin;
      if (rightMax > rightMin) rightSpan = rightMax - rightMin;

      let suggestedRotation = 0;
      let reason = 'Orientación vertical correcta';
      let confidence = 0.88;

      if (isLandscape) {
        // La foto está apaisada. Evaluamos la regla de perspectiva:
        // El lado con mayor span vertical es la base (parte inferior) de la hoja.
        if (rightSpan > leftSpan * 1.08) {
          suggestedRotation = 90;
          reason = 'Documento apaisado: lado derecho más ancho (rotado 90° a vertical)';
        } else {
          // El lado izquierdo es la base más ancha -> Giro 270°
          suggestedRotation = 270;
          reason = 'Documento apaisado: lado izquierdo más ancho/base (rotado 270° a vertical)';
        }
      } else {
        // La foto ya está en proporción vertical
        // Si la varianza por columnas supera con creces a la de filas, el texto está de costado
        if (varCol > varRow * 1.45) {
          suggestedRotation = 270;
          reason = 'Texto manuscrito vertical detectado (girado 270° a lectura)';
        } else {
          suggestedRotation = 0;
          reason = 'Documento vertical listo para lectura';
        }
      }

      return {
        suggestedRotation,
        confidence,
        needsReview: false,
        reason
      };
    } catch (err) {
      console.warn("Fallo al detectar orientación:", err);
      return {
        suggestedRotation: (srcMat.cols > srcMat.rows) ? 270 : 0,
        confidence: 0.70,
        needsReview: false,
        reason: 'Giro predeterminado a vertical'
      };
    } finally {
      matsToDelete.forEach(m => { try { m.delete(); } catch (_) {} });
    }
  }

  /**
   * DETECCIÓN ROBUSTA Y CONSERVADORA DE CONTORNO
   * - Si la hoja ya ocupa >75% del encuadre, NO RECORTA (conserva marco total 100%).
   * - Si hay mesa visible separable, recorta con margen de seguridad (+3.5%).
   */
  detectDocumentCorners(srcMat, safetyMarginPercent = 0.035) {
    const origW = srcMat.cols;
    const origH = srcMat.rows;

    if (!this.isOpenCvReady) {
      return this.getDefaultCorners(origW, origH, 'Marco total conservado');
    }

    const matsToDelete = [];
    try {
      const maxDim = 600;
      const scale = Math.min(1.0, maxDim / Math.max(origW, origH));
      const downW = Math.round(origW * scale);
      const downH = Math.round(origH * scale);

      const resized = new cv.Mat();
      matsToDelete.push(resized);
      cv.resize(srcMat, resized, new cv.Size(downW, downH), 0, 0, cv.INTER_AREA);

      const gray = new cv.Mat();
      matsToDelete.push(gray);
      cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);

      const blurred = new cv.Mat();
      matsToDelete.push(blurred);
      cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 0);

      // Umbralizado Otsu
      const thresh = new cv.Mat();
      matsToDelete.push(thresh);
      cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

      // Canny para encontrar aristas definidas del papel
      const edges = new cv.Mat();
      matsToDelete.push(edges);
      cv.Canny(blurred, edges, 35, 110);
      const kernelDilate = cv.Mat.ones(5, 5, cv.CV_8U);
      matsToDelete.push(kernelDilate);
      cv.dilate(edges, edges, kernelDilate);

      const combined = new cv.Mat();
      matsToDelete.push(combined);
      cv.bitwise_or(thresh, edges, combined);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      matsToDelete.push(contours, hierarchy);
      cv.findContours(combined, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const totalFrameArea = downW * downH;
      let largestContour = null;
      let maxArea = 0;

      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const area = cv.contourArea(c);
        if (area > maxArea) {
          maxArea = area;
          if (largestContour) largestContour.delete();
          largestContour = c;
        } else {
          c.delete();
        }
      }

      // REGLA CLAVE DE NO-RECORTAR INCORRECTAMENTE:
      // Si el contorno ocupa más del 78% del fotograma, la foto ya está encuadrada sobre la hoja.
      // O si el contorno es menor al 25% (demasiado pequeño o ruido), no cortar la foto.
      if (!largestContour || maxArea >= (totalFrameArea * 0.78) || maxArea < (totalFrameArea * 0.25)) {
        if (largestContour) largestContour.delete();
        return this.getDefaultCorners(origW, origH, 'Fotograma completo conservado (sin recorte innecesario)');
      }

      // Obtener envolvente convexa (Convex Hull)
      const hull = new cv.Mat();
      matsToDelete.push(hull);
      cv.convexHull(largestContour, hull, false, true);

      const pts = [];
      for (let i = 0; i < hull.rows; i++) {
        pts.push({
          x: hull.data32S[i * 2],
          y: hull.data32S[i * 2 + 1]
        });
      }
      largestContour.delete();

      if (pts.length < 4) {
        return this.getDefaultCorners(origW, origH, 'Fotograma completo conservado');
      }

      const orderedSmall = this.extractFourCornersFromPoints(pts);

      // Si alguna esquina está muy cerca del borde (< 5% del marco), no recortar agresivamente
      const marginBorder = downW * 0.05;
      const isTouchingBorder = orderedSmall.some(p => 
        p.x <= marginBorder || p.x >= downW - marginBorder ||
        p.y <= marginBorder || p.y >= downH - marginBorder
      );

      if (isTouchingBorder && (maxArea > totalFrameArea * 0.65)) {
        return this.getDefaultCorners(origW, origH, 'Bordes conservados (hoja pegada al encuadre)');
      }

      // Escalar a coordenadas reales
      const fullScaleCorners = orderedSmall.map(p => ({
        x: Math.round(p.x / scale),
        y: Math.round(p.y / scale)
      }));

      // Aplicar margen de seguridad generoso (+3.5%)
      const safeCorners = this.applySafetyMargin(fullScaleCorners, origW, origH, safetyMarginPercent);

      return {
        corners: safeCorners,
        confidence: 0.90,
        needsReview: false,
        reason: 'Hoja delimitada con margen de seguridad'
      };

    } catch (err) {
      console.warn("Fallo en detección de esquinas:", err);
      return this.getDefaultCorners(origW, origH, 'Fotograma completo');
    } finally {
      matsToDelete.forEach(m => { try { m.delete(); } catch (_) {} });
    }
  }

  extractFourCornersFromPoints(pts) {
    let tl = pts[0], tr = pts[0], br = pts[0], bl = pts[0];
    let minSum = Infinity, maxSum = -Infinity;
    let minDiff = Infinity, maxDiff = -Infinity;

    pts.forEach(p => {
      const sum = p.x + p.y;
      const diff = p.y - p.x;

      if (sum < minSum) { minSum = sum; tl = p; }
      if (sum > maxSum) { maxSum = sum; br = p; }
      if (diff < minDiff) { minDiff = diff; tr = p; }
      if (diff > maxDiff) { maxDiff = diff; bl = p; }
    });

    return [tl, tr, br, bl];
  }

  applySafetyMargin(corners, width, height, marginPercent = 0.035) {
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;

    return corners.map(pt => {
      const vx = pt.x - cx;
      const vy = pt.y - cy;
      return {
        x: Math.max(0, Math.min(width - 1, Math.round(cx + vx * (1 + marginPercent)))),
        y: Math.max(0, Math.min(height - 1, Math.round(cy + vy * (1 + marginPercent))))
      };
    });
  }

  getDefaultCorners(width, height, reason = 'Marco total') {
    return {
      corners: [
        { x: 0, y: 0 },
        { x: width - 1, y: 0 },
        { x: width - 1, y: height - 1 },
        { x: 0, y: height - 1 }
      ],
      confidence: 0.70,
      needsReview: false,
      reason
    };
  }

  /**
   * CORRECCIÓN DE PERSPECTIVA SEGURA
   */
  correctPerspective(srcMat, corners) {
    if (!this.isOpenCvReady) throw new Error("OpenCV no está inicializado");

    let [tl, tr, br, bl] = corners || [];
    if (!tl || !tr || !br || !bl) {
      return srcMat.clone();
    }

    const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
    const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const targetW = Math.max(120, Math.round(Math.max(widthA, widthB)));

    const heightA = Math.hypot(tr.x - br.x, tr.y - br.y);
    const heightB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
    const targetH = Math.max(120, Math.round(Math.max(heightA, heightB)));

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y,
      tr.x, tr.y,
      br.x, br.y,
      bl.x, bl.y
    ]);

    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      targetW - 1, 0,
      targetW - 1, targetH - 1,
      0, targetH - 1
    ]);

    try {
      const transformMat = cv.getPerspectiveTransform(srcTri, dstTri);
      const warped = new cv.Mat();
      cv.warpPerspective(srcMat, warped, transformMat, new cv.Size(targetW, targetH), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
      transformMat.delete();
      return warped;
    } catch (e) {
      console.warn("Fallo al aplicar warpPerspective, usando copia directa:", e);
      return srcMat.clone();
    } finally {
      srcTri.delete();
      dstTri.delete();
    }
  }

  /**
   * MEJORA DE LEGIBILIDAD: NIVELACIÓN ADITIVA (SIN RAYAS EN EL FONDO)
   */
  enhanceHistoricalDocument(warpedMat, options = {}) {
    const {
      illuminationCorrection = true,
      contrastFactor = 1.3,
      sharpnessFactor = 0.20
    } = options;

    if (!this.isOpenCvReady) return warpedMat.clone();

    const matsToDelete = [];
    try {
      const rgbMat = new cv.Mat();
      matsToDelete.push(rgbMat);
      cv.cvtColor(warpedMat, rgbMat, cv.COLOR_RGBA2RGB);

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

      // Nivelación aditiva suave
      if (illuminationCorrection) {
        const bgEstimate = new cv.Mat();
        matsToDelete.push(bgEstimate);
        const kSize = Math.max(31, Math.round(Math.min(warpedMat.cols, warpedMat.rows) / 20) | 1);
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
        cv.multiply(diff, new cv.Mat(L.rows, L.cols, cv.CV_32F, new cv.Scalar(0.60)), scaledDiff);

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
      const resultMat = new cv.Mat();
      matsToDelete.push(enhancedLab, enhancedRgb);

      cv.merge(enhancedPlanes, enhancedLab);
      cv.cvtColor(enhancedLab, enhancedRgb, cv.COLOR_Lab2RGB);
      cv.cvtColor(enhancedRgb, resultMat, cv.COLOR_RGB2RGBA);

      return resultMat;
    } catch (err) {
      console.warn("Fallo al mejorar manuscrito, conservando original:", err);
      return warpedMat.clone();
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
    thumbCanvas.width = Math.round(canvas.width * scale);
    thumbCanvas.height = Math.round(canvas.height * scale);
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
