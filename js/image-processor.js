/**
 * ==========================================================================
 * MOTOR DE PROCESAMIENTO DE IMÁGENES: HISTORICAL DOCUMENT ENHANCER v3.0
 * - Detección de orientación física por convergencia de perspectiva
 *   (la parte más ancha de la hoja corresponde a la base/abajo).
 * - Rotación inteligente a vertical (270° o 90° según apertura de encuadre).
 * - Detección robusta de contorno con Convex Hull y margen de seguridad (+2.5%).
 * - Nivelación aditiva de iluminación (cero división, cero rayas en el fondo).
 * - Realce suave de tinta ferrogálica y preservación de sellos y tonos sepia.
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
        resolve(1);
      };
      reader.onerror = () => resolve(1);
      reader.readAsArrayBuffer(file.slice(0, 65536));
    });
  }

  async loadImageFromFile(file, rotationDeg = 0) {
    const exifOrientation = await this.getExifOrientation(file);

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const normalizedCanvas = this.normalizeImageOrientation(img, exifOrientation, rotationDeg);
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

  normalizeImageOrientation(img, exifOrientation, additionalRotation = 0) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let totalRotation = Math.round(additionalRotation) % 360;
    if (totalRotation < 0) totalRotation += 360;

    let exifRot = 0;
    if (exifOrientation === 6) exifRot = 90;
    else if (exifOrientation === 3) exifRot = 180;
    else if (exifOrientation === 8) exifRot = 270;

    const finalDeg = (totalRotation + exifRot) % 360;

    if (finalDeg === 90 || finalDeg === 270) {
      canvas.width = img.height;
      canvas.height = img.width;
    } else {
      canvas.width = img.width;
      canvas.height = img.height;
    }

    ctx.save();
    if (finalDeg === 90) {
      ctx.translate(canvas.width, 0);
      ctx.rotate(90 * Math.PI / 180);
    } else if (finalDeg === 180) {
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(180 * Math.PI / 180);
    } else if (finalDeg === 270) {
      ctx.translate(0, canvas.height);
      ctx.rotate(270 * Math.PI / 180);
    }
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    return canvas;
  }

  /**
   * 2. DETECCIÓN INTELIGENTE DE ORIENTACIÓN:
   * Aplica el principio de perspectiva óptica en fotografía cenital/inclinada:
   * Al fotografiar una hoja en una mesa, el borde más cercano a la cámara (más ancho)
   * corresponde siempre a la parte inferior (abajo) del documento.
   */
  detectReadingOrientation(srcMat) {
    if (!this.isOpenCvReady) {
      return { suggestedRotation: 0, confidence: 0, needsReview: false, reason: 'OpenCV no listo' };
    }

    const matsToDelete = [];
    try {
      const origW = srcMat.cols;
      const origH = srcMat.rows;
      const isLandscape = origW > origH; // La foto fue tomada apaisada

      // Si la foto ya está en vertical (H > W), no requiere giro inicial
      if (!isLandscape) {
        return { suggestedRotation: 0, confidence: 0.9, needsReview: false, reason: 'Orientación vertical correcta' };
      }

      // Redimensionar para análisis rápido de perspectiva
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

      // Umbralizado para segmentar la hoja de papel respecto a la mesa
      const blurred = new cv.Mat();
      matsToDelete.push(blurred);
      cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 0);

      const thresh = new cv.Mat();
      matsToDelete.push(thresh);
      cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

      // Medir la altura vertical de la hoja en el sector izquierdo (15%-25%) y derecho (75%-85%)
      const leftCol = Math.round(thumbW * 0.20);
      const rightCol = Math.round(thumbW * 0.80);

      let leftSpan = 0;
      let leftMin = thumbH, leftMax = 0;
      for (let r = 0; r < thumbH; r++) {
        if (thresh.data[r * thumbW + leftCol] > 128) {
          if (r < leftMin) leftMin = r;
          if (r > leftMax) leftMax = r;
        }
      }
      if (leftMax > leftMin) leftSpan = leftMax - leftMin;

      let rightSpan = 0;
      let rightMin = thumbH, rightMax = 0;
      for (let r = 0; r < thumbH; r++) {
        if (thresh.data[r * thumbW + rightCol] > 128) {
          if (r < rightMin) rightMin = r;
          if (r > rightMax) rightMax = r;
        }
      }
      if (rightMax > rightMin) rightSpan = rightMax - rightMin;

      // REGLA DE PERSPECTIVA DEL USUARIO:
      // La parte más ancha de la hoja (mayor span) corresponde a la base/abajo del documento.
      // - Si el lado izquierdo es más ancho (leftSpan >= rightSpan), el borde izquierdo va hacia abajo -> GIRO 270°.
      // - Si el lado derecho es marcadamente más ancho (rightSpan > leftSpan * 1.08), el borde derecho va hacia abajo -> GIRO 90°.
      let suggestedRotation = 270; // Estándar para fotos tomadas con móvil en mano derecha
      let reason = 'Documento apaisado: rotado 270° a vertical';

      if (rightSpan > leftSpan * 1.08) {
        suggestedRotation = 90;
        reason = 'Documento apaisado (lado derecho más ancho): rotado 90° a vertical';
      } else {
        suggestedRotation = 270;
        reason = 'Documento apaisado (lado izquierdo más ancho/base): rotado 270° a vertical';
      }

      return {
        suggestedRotation,
        confidence: 0.92,
        needsReview: false,
        reason
      };
    } catch (err) {
      console.warn("Fallo al detectar orientación:", err);
      // Por defecto para fotos apaisadas en móvil sobre mesa, 270° es el giro óptimo
      return { suggestedRotation: 270, confidence: 0.75, needsReview: false, reason: 'Giro predeterminado 270°' };
    } finally {
      matsToDelete.forEach(m => { try { m.delete(); } catch (_) {} });
    }
  }

  /**
   * 3. DETECCIÓN ROBUSTA DEL CONTORNO DE LA HOJA PRINCIPAL
   */
  detectDocumentCorners(srcMat, safetyMarginPercent = 0.025) {
    if (!this.isOpenCvReady) {
      return this.getDefaultCorners(srcMat.cols, srcMat.rows, 'OpenCV no inicializado');
    }

    const matsToDelete = [];
    const origW = srcMat.cols;
    const origH = srcMat.rows;

    try {
      const maxDim = 700;
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

      const kernelClose = cv.Mat.ones(11, 11, cv.CV_8U);
      matsToDelete.push(kernelClose);
      cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernelClose);

      // Canny como refuerzo
      const edges = new cv.Mat();
      matsToDelete.push(edges);
      cv.Canny(blurred, edges, 30, 100);
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

        if (area > totalFrameArea * 0.20 && area < totalFrameArea * 0.99) {
          if (area > maxArea) {
            maxArea = area;
            if (largestContour) largestContour.delete();
            largestContour = c;
            continue;
          }
        }
        c.delete();
      }

      if (largestContour && maxArea > totalFrameArea * 0.25) {
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

        if (pts.length >= 4) {
          const orderedSmall = this.extractFourCornersFromPoints(pts);

          const fullScaleCorners = orderedSmall.map(p => ({
            x: Math.round(p.x / scale),
            y: Math.round(p.y / scale)
          }));

          const safeCorners = this.applySafetyMargin(fullScaleCorners, origW, origH, safetyMarginPercent);

          return {
            corners: safeCorners,
            confidence: Math.min(0.95, 0.65 + (maxArea / totalFrameArea) * 0.3),
            needsReview: false,
            reason: 'Hoja principal detectada y recortada'
          };
        }
      }

      return this.getDefaultCorners(origW, origH, 'Bordes conservados (fotograma completo)');
    } catch (err) {
      console.warn("Fallo al detectar contorno:", err);
      return this.getDefaultCorners(origW, origH, 'Detección automática omitida');
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

  applySafetyMargin(corners, width, height, marginPercent = 0.025) {
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

  getDefaultCorners(width, height, reason) {
    return {
      corners: [
        { x: 0, y: 0 },
        { x: width - 1, y: 0 },
        { x: width - 1, y: height - 1 },
        { x: 0, y: height - 1 }
      ],
      confidence: 0.6,
      needsReview: false,
      reason: reason
    };
  }

  correctPerspective(srcMat, corners) {
    if (!this.isOpenCvReady) throw new Error("OpenCV no listo");

    const [tl, tr, br, bl] = corners;

    const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
    const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const targetW = Math.max(100, Math.round(Math.max(widthA, widthB)));

    const heightA = Math.hypot(tr.x - br.x, tr.y - br.y);
    const heightB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
    const targetH = Math.max(100, Math.round(Math.max(heightA, heightB)));

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

    const transformMat = cv.getPerspectiveTransform(srcTri, dstTri);
    const warped = new cv.Mat();
    cv.warpPerspective(srcMat, warped, transformMat, new cv.Size(targetW, targetH), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    srcTri.delete();
    dstTri.delete();
    transformMat.delete();

    return warped;
  }

  /**
   * 5. MEJORA SUAVE DE LEGIBILIDAD (SIN RAYAS NI ALTERACIÓN DE FONDOS)
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
      const rgb = new cv.Mat();
      const lab = new cv.Mat();
      matsToDelete.push(rgb, lab);
      cv.cvtColor(warpedMat, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);

      const labPlanes = new cv.MatVector();
      matsToDelete.push(labPlanes);
      cv.split(lab, labPlanes);

      let L = labPlanes.get(0);
      const A = labPlanes.get(1);
      const B = labPlanes.get(2);
      matsToDelete.push(L, A, B);

      // Corrección aditiva y suave de iluminación irregular
      if (illuminationCorrection) {
        const bgEstimate = new cv.Mat();
        matsToDelete.push(bgEstimate);

        const blurSize = Math.max(51, Math.min(151, Math.round(Math.min(L.cols, L.rows) * 0.12) | 1));
        cv.GaussianBlur(L, bgEstimate, new cv.Size(blurSize, blurSize), 0);

        const meanScalar = cv.mean(bgEstimate);
        const meanBg = meanScalar[0];

        const alpha = 0.60;
        const L_float = new cv.Mat();
        const bg_float = new cv.Mat();
        const diff = new cv.Mat();
        const scaledDiff = new cv.Mat();
        const L_corr = new cv.Mat();
        matsToDelete.push(L_float, bg_float, diff, scaledDiff, L_corr);

        L.convertTo(L_float, cv.CV_32F);
        bgEstimate.convertTo(bg_float, cv.CV_32F);

        const meanMat = new cv.Mat(bg_float.rows, bg_float.cols, cv.CV_32F, new cv.Scalar(meanBg));
        matsToDelete.push(meanMat);
        cv.subtract(meanMat, bg_float, diff);

        cv.multiply(diff, new cv.Mat(diff.rows, diff.cols, cv.CV_32F, new cv.Scalar(alpha)), scaledDiff);
        cv.add(L_float, scaledDiff, L_corr);

        const L_clean = new cv.Mat();
        matsToDelete.push(L_clean);
        L_corr.convertTo(L_clean, cv.CV_8U);
        L = L_clean;
      }

      // CLAHE suave con bloque amplio (16x16)
      const claheL = new cv.Mat();
      matsToDelete.push(claheL);
      const clahe = new cv.CLAHE(contrastFactor, new cv.Size(16, 16));
      clahe.apply(L, claheL);
      clahe.delete();

      // Nitidez suave selectiva
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

      // Recomponer canales LAB con colores originales
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
      console.warn("Fallo al aplicar mejora de legibilidad:", err);
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
}

window.documentImageProcessor = new ImageProcessor();
