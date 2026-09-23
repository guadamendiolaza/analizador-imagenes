/**
 * ==========================================================================
 * APLICACIÓN PRINCIPAL: ANALIZADOR Y MEJORADOR DE MANUSCRITOS HISTÓRICOS v3.8
 * - Gestión de lotes con giro automático en el sentido de lectura.
 * - Marcado ágil de fotos "En Revisión".
 * - Botones dedicados para girar 180° o 90° ÚNICAMENTE las fotos en revisión.
 * - Recorte no destructivo y preservación total del documento.
 * - Inclusión de PDF completo consolidado en orden original dentro del ZIP
 *   y botón de descarga directa de PDF.
 * ==========================================================================
 */

class ManuscriptApp {
  constructor() {
    this.items = []; // Lista ordenada de documentos en el lote
    this.activeFilter = 'all'; // 'all', 'review', 'ok'
    this.isProcessing = false;
    this.selectedItem = null;
    this.activeModalTab = 'split'; // 'split' | 'corners'

    this.cornerEditor = null;
    this.splitSliderPosition = 50;
    this.isDraggingSlider = false;

    this.initDOMElements();
    this.initOpenCv();
    this.initEventListeners();
    this.initDropzone();
  }

  /**
   * Referencias a los elementos del DOM
   */
  initDOMElements() {
    this.engineStatusEl = document.getElementById('engineStatus');
    this.statusDotEl = document.getElementById('statusDot');
    this.statusTextEl = document.getElementById('statusText');

    this.folderInput = document.getElementById('folderInput');
    this.filesInput = document.getElementById('filesInput');
    this.btnProcessBatch = document.getElementById('btnProcessBatch');

    // Botones de acción masiva
    this.btnRotateReview180 = document.getElementById('btnRotateReview180');
    this.btnRotateReview90 = document.getElementById('btnRotateReview90');
    this.btnRotateBatch270 = document.getElementById('btnRotateBatch270');
    this.btnAcceptAuto = document.getElementById('btnAcceptAuto');
    this.btnDownloadZip = document.getElementById('btnDownloadZip');
    this.btnDownloadPdf = document.getElementById('btnDownloadPdf');
    this.btnClearAll = document.getElementById('btnClearAll');
    this.btnOpenGuide = document.getElementById('btnOpenGuide');

    // Barra de progreso y estadísticas
    this.progressCard = document.getElementById('progressCard');
    this.progressBar = document.getElementById('progressBar');
    this.progressPercentText = document.getElementById('progressPercentText');
    this.statOkEl = document.getElementById('statOk');
    this.statWarnEl = document.getElementById('statWarn');
    this.statErrEl = document.getElementById('statErr');

    // Filtros
    this.filterTabs = document.querySelectorAll('.filter-tab');
    this.countAllEl = document.getElementById('countAll');
    this.countReviewEl = document.getElementById('countReview');
    this.countOkEl = document.getElementById('countOk');

    this.emptyState = document.getElementById('emptyState');
    this.documentsGrid = document.getElementById('documentsGrid');

    // Modal Inspector
    this.inspectorModal = document.getElementById('inspectorModal');
    this.modalTitleEl = document.getElementById('modalDocTitle');
    this.modalTabSplit = document.getElementById('modalTabSplit');
    this.modalTabCorners = document.getElementById('modalTabCorners');
    this.viewSplitArea = document.getElementById('viewSplitArea');
    this.viewCornersArea = document.getElementById('viewCornersArea');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.btnModalCancel = document.getElementById('btnModalCancel');
    this.btnModalApply = document.getElementById('btnModalApply');

    this.compImgBefore = document.getElementById('compImgBefore');
    this.compImgAfter = document.getElementById('compImgAfter');
    this.compAfterOverlay = document.getElementById('compAfterOverlay');
    this.compSliderHandle = document.getElementById('compSliderHandle');

    this.cornerCanvas = document.getElementById('cornerCanvas');
    this.loupeMagnifier = document.getElementById('loupeMagnifier');
    this.btnCornerFull = document.getElementById('btnCornerFull');
    this.btnCornerAuto = document.getElementById('btnCornerAuto');
    this.btnMarginPlus = document.getElementById('btnMarginPlus');
    this.btnMarginMinus = document.getElementById('btnMarginMinus');

    this.sliderContrast = document.getElementById('sliderContrast');
    this.valContrast = document.getElementById('valContrast');
    this.sliderSharpness = document.getElementById('sliderSharpness');
    this.valSharpness = document.getElementById('valSharpness');
    this.chkIllumination = document.getElementById('chkIllumination');
    this.btnModalRotate = document.getElementById('btnModalRotate');

    this.guideModal = document.getElementById('guideModal');
    this.guideCloseBtn = document.getElementById('guideCloseBtn');
    this.btnGuideGotIt = document.getElementById('btnGuideGotIt');

    this.toastContainer = document.getElementById('toastContainer');
  }

  initOpenCv() {
    const checkOpenCv = () => {
      if (window.cv && window.cv.Mat) {
        window.documentImageProcessor.setOpenCvReady();
        if (this.statusDotEl) this.statusDotEl.className = 'status-dot ready';
        if (this.statusTextEl) this.statusTextEl.textContent = 'Motor OpenCV listo (100% Local)';
        this.updateButtonsState();
      } else {
        setTimeout(checkOpenCv, 250);
      }
    };
    checkOpenCv();
  }

  initEventListeners() {
    if (this.folderInput) this.folderInput.addEventListener('change', (e) => this.handleFilesSelected(e.target.files));
    if (this.filesInput) this.filesInput.addEventListener('change', (e) => this.handleFilesSelected(e.target.files));

    if (this.btnProcessBatch) this.btnProcessBatch.addEventListener('click', () => this.processEntireBatch());

    // Botones de giro para fotos en revisión
    if (this.btnRotateReview180) {
      this.btnRotateReview180.addEventListener('click', () => this.rotateReviewItems(180));
    }
    if (this.btnRotateReview90) {
      this.btnRotateReview90.addEventListener('click', () => this.rotateReviewItems(90));
    }

    if (this.btnRotateBatch270) {
      this.btnRotateBatch270.addEventListener('click', () => this.rotateAllBatch(270));
    }

    if (this.btnAcceptAuto) this.btnAcceptAuto.addEventListener('click', () => this.acceptAllAutomatic());
    if (this.btnDownloadZip) this.btnDownloadZip.addEventListener('click', () => this.downloadZipPackage());

    if (this.btnDownloadPdf) {
      this.btnDownloadPdf.addEventListener('click', () => this.downloadSinglePdf());
    }

    if (this.btnClearAll) this.btnClearAll.addEventListener('click', () => this.clearAll());

    this.filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeFilter = tab.dataset.filter;
        this.renderGrid();
      });
    });

    if (this.modalTabSplit) this.modalTabSplit.addEventListener('click', () => this.switchModalTab('split'));
    if (this.modalTabCorners) this.modalTabCorners.addEventListener('click', () => this.switchModalTab('corners'));

    if (this.modalCloseBtn) this.modalCloseBtn.addEventListener('click', () => this.closeInspector());
    if (this.btnModalCancel) this.btnModalCancel.addEventListener('click', () => this.closeInspector());
    if (this.btnModalApply) this.btnModalApply.addEventListener('click', () => this.applyModalChanges());

    if (this.btnModalRotate) {
      this.btnModalRotate.addEventListener('click', async () => {
        if (!this.selectedItem) return;
        this.selectedItem.rotationDeg = (this.selectedItem.rotationDeg + 90) % 360;
        this.selectedItem.isManuallyRotated = true;
        this.selectedItem.corners = null;
        await this.reprocessSingleItem(this.selectedItem);
        this.openInspector(this.selectedItem);
      });
    }

    if (this.sliderContrast && this.valContrast) {
      this.sliderContrast.addEventListener('input', (e) => {
        this.valContrast.textContent = parseFloat(e.target.value).toFixed(1);
      });
    }
    if (this.sliderSharpness && this.valSharpness) {
      this.sliderSharpness.addEventListener('input', (e) => {
        this.valSharpness.textContent = parseFloat(e.target.value).toFixed(2);
      });
    }

    if (this.btnCornerFull) {
      this.btnCornerFull.addEventListener('click', () => {
        if (this.cornerEditor) this.cornerEditor.resetToFullFrame();
      });
    }
    if (this.btnCornerAuto) {
      this.btnCornerAuto.addEventListener('click', () => {
        if (this.cornerEditor) this.cornerEditor.resetToAuto();
      });
    }
    if (this.btnMarginPlus) {
      this.btnMarginPlus.addEventListener('click', () => {
        if (this.cornerEditor) this.cornerEditor.adjustMargin(0.02);
      });
    }
    if (this.btnMarginMinus) {
      this.btnMarginMinus.addEventListener('click', () => {
        if (this.cornerEditor) this.cornerEditor.adjustMargin(-0.02);
      });
    }

    this.initSplitSlider();

    if (this.btnOpenGuide) {
      this.btnOpenGuide.addEventListener('click', () => {
        if (this.guideModal) this.guideModal.classList.add('active');
      });
    }
    if (this.guideCloseBtn) {
      this.guideCloseBtn.addEventListener('click', () => {
        if (this.guideModal) this.guideModal.classList.remove('active');
      });
    }
    if (this.btnGuideGotIt) {
      this.btnGuideGotIt.addEventListener('click', () => {
        if (this.guideModal) this.guideModal.classList.remove('active');
      });
    }
  }

  initDropzone() {
    ['dragenter', 'dragover'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.emptyState) this.emptyState.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.emptyState) this.emptyState.classList.remove('dragover');
      });
    });

    window.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.handleFilesSelected(e.dataTransfer.files);
      }
    });
  }

  initSplitSlider() {
    if (!this.compSliderHandle || !this.compImgBefore) return;

    const handleStart = (e) => {
      this.isDraggingSlider = true;
      e.preventDefault();
    };

    const handleMove = (e) => {
      if (!this.isDraggingSlider) return;
      const rect = this.compImgBefore.parentElement.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let pos = ((clientX - rect.left) / rect.width) * 100;
      pos = Math.max(0, Math.min(100, pos));
      this.updateSplitSlider(pos);
    };

    const handleEnd = () => {
      this.isDraggingSlider = false;
    };

    this.compSliderHandle.addEventListener('mousedown', handleStart);
    this.compSliderHandle.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
  }

  updateSplitSlider(percent) {
    this.splitSliderPosition = percent;
    if (this.compAfterOverlay) this.compAfterOverlay.style.width = `${percent}%`;
    if (this.compSliderHandle) this.compSliderHandle.style.left = `${percent}%`;
  }

  async handleFilesSelected(fileList) {
    const validFiles = Array.from(fileList).filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.jpg') || name.endsWith('.jpeg') || f.type === 'image/jpeg';
    });

    if (validFiles.length === 0) {
      this.showToast('No se encontraron imágenes JPG/JPEG en la selección', 'warning');
      return;
    }

    // Ordenar alfabéticamente por nombre de archivo para preservar el orden exacto de los folios
    validFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    this.showToast(`Cargando ${validFiles.length} imagen(es) en orden...`, 'info');

    for (const file of validFiles) {
      if (this.items.some(it => it.name === file.name)) continue;

      const item = {
        id: 'doc_' + Math.random().toString(36).substr(2, 9),
        file: file,
        name: file.name,
        size: file.size,
        originalCanvas: null,
        enhancedCanvas: null,
        thumbUrl: null,
        corners: null,
        autoCorners: null,
        rotationDeg: 0,
        exifOrientation: 1,
        status: 'pending',
        needsReview: false,
        reviewReason: 'Listo para procesar',
        confidence: 0,
        isManuallyAccepted: false,
        isManuallyRotated: false,
        contrastFactor: 1.3,
        sharpnessFactor: 0.20,
        illuminationCorrection: true
      };

      this.items.push(item);
    }

    this.updateUI();
    this.showToast(`${this.items.length} imágenes listas. Haz clic en "⚡ Procesar Lote".`, 'success');
  }

  async processEntireBatch() {
    if (this.isProcessing) return;
    if (!window.documentImageProcessor.isOpenCvReady) {
      this.showToast('Esperando a que OpenCV termine de iniciar...', 'warning');
      return;
    }

    this.isProcessing = true;
    this.updateButtonsState();
    this.progressCard.style.display = 'flex';

    let processedCount = 0;
    const total = this.items.length;

    for (let i = 0; i < total; i++) {
      const item = this.items[i];
      if (item.status === 'ok' && item.isManuallyAccepted) {
        processedCount++;
        continue;
      }

      item.status = 'processing';
      this.renderItemCard(item);

      try {
        await this.processSingleItem(item);
      } catch (err) {
        console.error(`Error al procesar ${item.name}:`, err);
        item.status = 'error';
        item.needsReview = true;
        item.reviewReason = 'Error en el procesamiento: ' + (err.message || 'desconocido');
      }

      processedCount++;
      const percent = Math.round((processedCount / total) * 100);
      this.progressBar.style.width = `${percent}%`;
      this.progressPercentText.textContent = `${percent}% (${processedCount}/${total})`;
      this.updateStatsCounters();
      this.renderItemCard(item);

      await new Promise(r => setTimeout(r, 15));
    }

    this.isProcessing = false;
    this.updateButtonsState();
    this.updateStatsCounters();
    this.renderGrid();
    this.showToast('¡Lote procesado! Revisa los resultados.', 'success');
  }

  async processSingleItem(item) {
    const processor = window.documentImageProcessor;

    // Cargar con rotación previa si ya fue establecida
    let loaded = await processor.loadImageFromFile(item.file, item.rotationDeg, 2800);
    item.originalCanvas = loaded.element;
    item.exifOrientation = loaded.exifOrientation;

    let srcMat = null;
    let warpedMat = null;
    let enhancedMat = null;

    try {
      srcMat = processor.elementToMat(item.originalCanvas);

      // Si la foto aún no fue rotada manualmente por el usuario:
      if (item.rotationDeg === 0 && !item.isManuallyRotated) {
        const orientationResult = processor.detectReadingOrientation(srcMat);

        if (orientationResult.suggestedRotation !== 0) {
          item.rotationDeg = orientationResult.suggestedRotation;
          item.autoRotationApplied = true;
          item.reviewReason = orientationResult.reason;

          srcMat.delete();
          srcMat = null;

          loaded = await processor.loadImageFromFile(item.file, item.rotationDeg, 2800);
          item.originalCanvas = loaded.element;
          srcMat = processor.elementToMat(item.originalCanvas);
        }
      }

      // Detección de contornos y cálculo de las 4 esquinas si no estaban definidas
      if (!item.corners) {
        const docResult = processor.detectDocumentCorners(srcMat, 0.035);
        item.corners = docResult.corners;
        item.autoCorners = JSON.parse(JSON.stringify(docResult.corners));
        item.confidence = docResult.confidence;

        if (docResult.reason) {
          item.reviewReason = (item.autoRotationApplied ? `Giro ${item.rotationDeg}° | ` : '') + docResult.reason;
        }
      }

      // Corrección de perspectiva
      warpedMat = processor.correctPerspective(srcMat, item.corners);

      // Mejora suave sin rayas
      enhancedMat = processor.enhanceHistoricalDocument(warpedMat, {
        illuminationCorrection: item.illuminationCorrection,
        contrastFactor: item.contrastFactor,
        sharpnessFactor: item.sharpnessFactor
      });

      item.enhancedCanvas = processor.matToCanvas(enhancedMat);
      item.thumbUrl = processor.createThumbnailFromCanvas(item.enhancedCanvas, 360);

      if (item.needsReview && !item.isManuallyAccepted) {
        item.status = 'review';
      } else {
        item.status = 'ok';
      }
    } finally {
      if (srcMat) srcMat.delete();
      if (warpedMat) warpedMat.delete();
      if (enhancedMat) enhancedMat.delete();
    }
  }

  /**
   * GIRA ÚNICAMENTE LAS FOTOS QUE ESTÁN MARCADAS COMO "EN REVISIÓN"
   */
  async rotateReviewItems(degDelta) {
    const reviewItems = this.items.filter(it => it.status === 'review');

    if (reviewItems.length === 0) {
      this.showToast('No hay ninguna foto marcada como "En Revisión". Marca primero las que desees girar.', 'info');
      return;
    }

    this.showToast(`Girando ${reviewItems.length} foto(s) en revisión (+${degDelta}°)...`, 'info');

    for (const item of reviewItems) {
      item.rotationDeg = (item.rotationDeg + degDelta) % 360;
      item.isManuallyRotated = true;
      item.corners = null; // Recalcular contorno con la nueva orientación
      await this.reprocessSingleItem(item);
    }

    this.updateStatsCounters();
    this.renderGrid();
    this.showToast(`Se giraron las ${reviewItems.length} fotos en revisión.`, 'success');
  }

  async rotateAllBatch(degDelta) {
    if (this.items.length === 0 || this.isProcessing) return;

    this.showToast(`Girando todo el lote ${degDelta}°...`, 'info');
    for (const item of this.items) {
      item.rotationDeg = (item.rotationDeg + degDelta) % 360;
      item.isManuallyRotated = true;
      item.corners = null;
    }

    await this.processEntireBatch();
  }

  async reprocessSingleItem(item) {
    item.status = 'processing';
    this.renderItemCard(item);
    try {
      await this.processSingleItem(item);
    } catch (e) {
      console.error("Error al reprocesar imagen individual:", e);
      item.status = 'error';
      item.reviewReason = 'Error: ' + e.message;
    }
    this.updateStatsCounters();
    this.renderItemCard(item);
  }

  openInspector(item) {
    this.selectedItem = item;
    if (this.modalTitleEl) this.modalTitleEl.textContent = item.name;

    const beforeSrc = item.originalCanvas ? item.originalCanvas.toDataURL('image/jpeg', 0.88) : '';
    const afterSrc = item.enhancedCanvas ? item.enhancedCanvas.toDataURL('image/jpeg', 0.88) : beforeSrc;

    if (this.compImgBefore) this.compImgBefore.src = beforeSrc;
    if (this.compImgAfter) this.compImgAfter.src = afterSrc;
    this.updateSplitSlider(50);

    if (this.sliderContrast) {
      this.sliderContrast.value = item.contrastFactor;
      if (this.valContrast) this.valContrast.textContent = item.contrastFactor.toFixed(1);
    }
    if (this.sliderSharpness) {
      this.sliderSharpness.value = item.sharpnessFactor;
      if (this.valSharpness) this.valSharpness.textContent = item.sharpnessFactor.toFixed(2);
    }
    if (this.chkIllumination) this.chkIllumination.checked = item.illuminationCorrection;

    if (!this.cornerEditor && this.cornerCanvas) {
      this.cornerEditor = new CornerEditor(this.cornerCanvas, this.loupeMagnifier);
    }
    if (this.cornerEditor && item.originalCanvas) {
      this.cornerEditor.loadImage(item.originalCanvas, item.corners, item.autoCorners);
    }

    this.switchModalTab(this.activeModalTab);
    if (this.inspectorModal) this.inspectorModal.classList.add('active');
  }

  switchModalTab(tabKey) {
    this.activeModalTab = tabKey;
    if (tabKey === 'split') {
      if (this.modalTabSplit) this.modalTabSplit.classList.add('active');
      if (this.modalTabCorners) this.modalTabCorners.classList.remove('active');
      if (this.viewSplitArea) this.viewSplitArea.style.display = 'flex';
      if (this.viewCornersArea) this.viewCornersArea.style.display = 'none';
    } else {
      if (this.modalTabCorners) this.modalTabCorners.classList.add('active');
      if (this.modalTabSplit) this.modalTabSplit.classList.remove('active');
      if (this.viewSplitArea) this.viewSplitArea.style.display = 'none';
      if (this.viewCornersArea) this.viewCornersArea.style.display = 'flex';
      if (this.cornerEditor) {
        setTimeout(() => {
          this.cornerEditor.resizeCanvas();
          this.cornerEditor.draw();
        }, 50);
      }
    }
  }

  closeInspector() {
    if (this.inspectorModal) this.inspectorModal.classList.remove('active');
    if (this.cornerEditor) this.cornerEditor.hideLoupe();
    this.selectedItem = null;
  }

  async applyModalChanges() {
    if (!this.selectedItem) return;
    const item = this.selectedItem;

    if (this.cornerEditor) {
      item.corners = this.cornerEditor.getCorners();
    }

    if (this.sliderContrast) item.contrastFactor = parseFloat(this.sliderContrast.value);
    if (this.sliderSharpness) item.sharpnessFactor = parseFloat(this.sliderSharpness.value);
    if (this.chkIllumination) item.illuminationCorrection = this.chkIllumination.checked;

    item.isManuallyAccepted = true;
    item.needsReview = false;
    item.status = 'ok';
    item.reviewReason = 'Ajuste verificado por el usuario';

    this.closeInspector();
    this.showToast(`Guardando cambios en ${item.name}...`, 'info');
    await this.reprocessSingleItem(item);
    this.showToast(`${item.name} actualizado con éxito`, 'success');
  }

  acceptAllAutomatic() {
    let count = 0;
    this.items.forEach(it => {
      if (it.status === 'review' || it.status === 'pending') {
        it.status = 'ok';
        it.isManuallyAccepted = true;
        it.needsReview = false;
        count++;
      }
    });
    this.updateStatsCounters();
    this.renderGrid();
    this.showToast(`Se han marcado ${count} imagen(es) como aceptadas`, 'success');
  }

  /**
   * GENERADOR DE PDF CONSOLIDADO EN ORDEN DE ARCHIVOS
   */
  async generateConsolidatedPdf() {
    if (typeof window.jspdf === 'undefined') {
      throw new Error('La biblioteca jsPDF no está disponible');
    }

    const { jsPDF } = window.jspdf;
    let pdf = null;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const canvas = item.enhancedCanvas || item.originalCanvas;
      if (!canvas) continue;

      const imgW = canvas.width;
      const imgH = canvas.height;
      const isLandscape = imgW > imgH;

      if (!pdf) {
        pdf = new jsPDF({
          orientation: isLandscape ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [imgW, imgH]
        });
      } else {
        pdf.addPage([imgW, imgH], isLandscape ? 'landscape' : 'portrait');
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.90);
      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH, undefined, 'FAST');
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    return pdf ? pdf.output('blob') : null;
  }

  /**
   * DESCARGA DIRECTA DEL PDF COMPLETO
   */
  async downloadSinglePdf() {
    if (this.items.length === 0) return;

    this.showToast('Compilando PDF con todos los folios en orden...', 'info');
    try {
      const pdfBlob = await this.generateConsolidatedPdf();
      if (!pdfBlob) {
        this.showToast('No hay imágenes procesadas para generar el PDF', 'warning');
        return;
      }

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manuscritos_completos_mejorados.pdf';
      a.click();
      URL.revokeObjectURL(url);

      this.showToast('¡PDF consolidado descargado con éxito!', 'success');
    } catch (e) {
      console.error(e);
      this.showToast('Error al generar el PDF: ' + e.message, 'danger');
    }
  }

  /**
   * DESCARGA DEL ZIP:
   * Incluye todas las imágenes individuales _mejorada.jpg,
   * MÁS el PDF completo consolidado en orden original,
   * MÁS el informe de resumen del lote.
   */
  async downloadZipPackage() {
    if (this.items.length === 0) return;
    if (typeof JSZip === 'undefined') {
      this.showToast('La biblioteca JSZip no está lista', 'danger');
      return;
    }

    const unready = this.items.filter(it => it.status === 'pending' || !it.enhancedCanvas);
    if (unready.length > 0) {
      const confirmContinue = confirm(`Hay ${unready.length} fotos aún no procesadas. ¿Deseas procesarlas antes de descargar?`);
      if (confirmContinue) {
        await this.processEntireBatch();
      }
    }

    this.showToast('Generando ZIP con imágenes individuales y PDF completo...', 'info');
    const zip = new JSZip();
    const folder = zip.folder("manuscritos_mejorados");

    let autoCount = 0;
    let manualCount = 0;
    let reviewCount = 0;
    const reportLines = [];

    reportLines.push("===============================================================================");
    reportLines.push("INFORME DE PROCESAMIENTO - MEJORADOR DE MANUSCRITOS HISTÓRICOS");
    reportLines.push(`Fecha: ${new Date().toLocaleString()}`);
    reportLines.push(`Total de documentos en orden: ${this.items.length}`);
    reportLines.push("===============================================================================\n");

    // 1. Agregar imágenes individuales con sufijo _mejorada.jpg
    for (let idx = 0; idx < this.items.length; idx++) {
      const item = this.items[idx];
      const baseName = item.name.replace(/\.[^/.]+$/, "");
      const outputName = `${baseName}_mejorada.jpg`;

      const canvas = item.enhancedCanvas || item.originalCanvas;
      if (!canvas) continue;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

      folder.file(outputName, base64Data, { base64: true });

      let recordType = "Ajuste Automático";
      if (item.isManuallyAccepted) {
        recordType = "Revisado / Aceptado";
        manualCount++;
      } else if (item.status === 'review') {
        recordType = "En Revisión";
        reviewCount++;
      } else {
        autoCount++;
      }

      reportLines.push(`${idx + 1}. ${outputName}`);
      reportLines.push(`   - Original: ${item.name} (${Math.round(item.size / 1024)} KB)`);
      reportLines.push(`   - Estado: ${recordType}`);
      reportLines.push(`   - Giro aplicado: ${item.rotationDeg}°`);
      reportLines.push(`   - Detalle: ${item.reviewReason || 'Procesado'}\n`);
    }

    // 2. Generar y agregar el PDF consolidado con todas las hojas
    try {
      this.showToast('Compilando PDF consolidado para incluirlo en el ZIP...', 'info');
      const pdfBlob = await this.generateConsolidatedPdf();
      if (pdfBlob) {
        folder.file("documento_completo_ordenado.pdf", pdfBlob);
        reportLines.push("• Se incluyó el archivo 'documento_completo_ordenado.pdf' con todas las páginas en secuencia.");
      }
    } catch (errPdf) {
      console.warn("No se pudo adjuntar el PDF al ZIP:", errPdf);
    }

    reportLines.push("\n===============================================================================");
    reportLines.push(`RESUMEN: ${autoCount} automáticos | ${manualCount} aceptados | ${reviewCount} en revisión`);
    reportLines.push("Nota: Los archivos originales de tu computadora permanecen 100% intactos.");
    reportLines.push("===============================================================================");

    zip.file("resumen_del_lote.txt", reportLines.join("\n"));

    const content = await zip.generateAsync({ type: "blob" });
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(content);
    downloadLink.download = "manuscritos_mejorados.zip";
    downloadLink.click();
    URL.revokeObjectURL(downloadLink.href);

    this.showToast('¡Descarga completada! ZIP listo con fotos y PDF.', 'success');
  }

  renderGrid() {
    this.documentsGrid.innerHTML = '';

    const filtered = this.items.filter(item => {
      if (this.activeFilter === 'review') return item.status === 'review';
      if (this.activeFilter === 'ok') return item.status === 'ok';
      return true;
    });

    if (filtered.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);';
      msg.textContent = 'No hay documentos que coincidan con este filtro.';
      this.documentsGrid.appendChild(msg);
      return;
    }

    filtered.forEach(item => {
      const card = this.createCardElement(item);
      this.documentsGrid.appendChild(card);
    });
  }

  /**
   * Crea el elemento tarjeta con controles para ACEPTAR o MARCAR EN REVISIÓN
   */
  createCardElement(item) {
    const card = document.createElement('div');
    card.id = `card_${item.id}`;
    card.className = `doc-card status-${item.status}`;

    let badgeClass = 'badge-neutral';
    let badgeText = 'Pendiente';
    if (item.status === 'ok') {
      badgeClass = 'badge-success';
      badgeText = item.isManuallyAccepted ? '✓ Revisado' : '✓ Óptimo';
    } else if (item.status === 'review') {
      badgeClass = 'badge-warning';
      badgeText = '⚠️ En Revisión';
    } else if (item.status === 'error') {
      badgeClass = 'badge-danger';
      badgeText = '✕ Error';
    } else if (item.status === 'processing') {
      badgeClass = 'badge-neutral';
      badgeText = 'Procesando...';
    }

    const thumbUrl = item.thumbUrl || (item.enhancedCanvas || item.originalCanvas ? (item.enhancedCanvas || item.originalCanvas).toDataURL('image/jpeg', 0.8) : '');
    const isReview = (item.status === 'review');

    card.innerHTML = `
      <div class="card-media" title="Haz clic para comparar antes/después">
        <img class="card-img" src="${thumbUrl}" alt="${item.name}">
        <div class="card-badges">
          <span class="badge ${badgeClass}">${badgeText}</span>
          ${item.rotationDeg !== 0 ? `<span class="badge badge-success" title="Giro aplicado">Giro: ${item.rotationDeg}°</span>` : ''}
        </div>
        <button class="card-preview-toggle" title="Abrir visor interactivo">
          <span>🔍 Comparar</span>
        </button>
      </div>

      <div class="card-content">
        <div class="card-title-row">
          <span class="card-filename" title="${item.name}">${item.name}</span>
          <span class="card-filesize">${Math.round(item.size / 1024)} KB</span>
        </div>

        <div class="card-meta-tags">
          <span class="meta-tag">${item.reviewReason || 'Procesado'}</span>
        </div>

        <div class="card-actions">
          <div class="card-btn-group">
            <button class="icon-btn btn-rotate" title="Girar 90° a la derecha">↻</button>
            <button class="icon-btn btn-edit-corners" title="Ajustar 4 esquinas del recorte">📐</button>
          </div>
          
          <div class="card-btn-group">
            <!-- Botón de alternancia: Aceptar o Marcar para Revisión -->
            ${isReview ? `
              <button class="btn btn-sm btn-primary btn-toggle-status" title="Marcar como correcta">
                <span>✓ Aceptar</span>
              </button>
            ` : `
              <button class="btn btn-sm btn-outline btn-toggle-status" style="border-color: rgba(245, 158, 11, 0.4); color: #fbbf24;" title="Marcar esta foto para revisarla o girarla en lote">
                <span>⚠️ Revisar</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    const mediaEl = card.querySelector('.card-media');
    mediaEl.addEventListener('click', () => {
      if (item.originalCanvas) this.openInspector(item);
      else this.showToast('Procesa primero la imagen para inspeccionarla', 'info');
    });

    const btnRotate = card.querySelector('.btn-rotate');
    btnRotate.addEventListener('click', async (e) => {
      e.stopPropagation();
      item.rotationDeg = (item.rotationDeg + 90) % 360;
      item.isManuallyRotated = true;
      item.corners = null;
      await this.reprocessSingleItem(item);
      this.showToast(`Giro ajustado a ${item.rotationDeg}° en ${item.name}`, 'info');
    });

    const btnCorners = card.querySelector('.btn-edit-corners');
    btnCorners.addEventListener('click', (e) => {
      e.stopPropagation();
      this.activeModalTab = 'corners';
      if (item.originalCanvas) this.openInspector(item);
    });

    const btnToggle = card.querySelector('.btn-toggle-status');
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.status === 'review') {
        item.status = 'ok';
        item.isManuallyAccepted = true;
        item.needsReview = false;
        this.showToast(`${item.name} marcado como Aceptado`, 'success');
      } else {
        item.status = 'review';
        item.isManuallyAccepted = false;
        item.needsReview = true;
        item.reviewReason = 'Marcada para revisión por el usuario';
        this.showToast(`${item.name} marcada para Revisión`, 'warning');
      }
      this.updateStatsCounters();
      this.renderItemCard(item);
    });

    return card;
  }

  renderItemCard(item) {
    const existing = document.getElementById(`card_${item.id}`);
    if (existing) {
      const newCard = this.createCardElement(item);
      existing.replaceWith(newCard);
    }
  }

  updateStatsCounters() {
    const total = this.items.length;
    const okCount = this.items.filter(i => i.status === 'ok').length;
    const reviewCount = this.items.filter(i => i.status === 'review').length;
    const errCount = this.items.filter(i => i.status === 'error').length;

    if (this.statOkEl) this.statOkEl.textContent = okCount;
    if (this.statWarnEl) this.statWarnEl.textContent = reviewCount;
    if (this.statErrEl) this.statErrEl.textContent = errCount;

    if (this.countAllEl) this.countAllEl.textContent = total;
    if (this.countReviewEl) this.countReviewEl.textContent = reviewCount;
    if (this.countOkEl) this.countOkEl.textContent = okCount;

    if (this.btnRotateReview180) {
      this.btnRotateReview180.disabled = (reviewCount === 0 || this.isProcessing);
      this.btnRotateReview180.title = reviewCount > 0 
        ? `Girar 180° las ${reviewCount} fotos en revisión` 
        : 'Marca fotos para revisión para usar este botón';
    }
    if (this.btnRotateReview90) {
      this.btnRotateReview90.disabled = (reviewCount === 0 || this.isProcessing);
    }
  }

  updateUI() {
    const hasItems = this.items.length > 0;
    if (this.emptyState) this.emptyState.style.display = hasItems ? 'none' : 'flex';
    if (this.documentsGrid) this.documentsGrid.style.display = hasItems ? 'grid' : 'none';

    this.updateStatsCounters();
    this.updateButtonsState();
    if (hasItems) {
      this.renderGrid();
    }
  }

  updateButtonsState() {
    const hasItems = this.items.length > 0;
    const cvReady = window.documentImageProcessor.isOpenCvReady;
    const reviewCount = this.items.filter(i => i.status === 'review').length;

    if (this.btnProcessBatch) this.btnProcessBatch.disabled = !hasItems || !cvReady || this.isProcessing;
    if (this.btnRotateBatch270) this.btnRotateBatch270.disabled = !hasItems || this.isProcessing;
    if (this.btnRotateReview180) this.btnRotateReview180.disabled = (reviewCount === 0 || this.isProcessing);
    if (this.btnRotateReview90) this.btnRotateReview90.disabled = (reviewCount === 0 || this.isProcessing);

    if (this.btnAcceptAuto) this.btnAcceptAuto.disabled = !hasItems || this.isProcessing;
    if (this.btnDownloadZip) this.btnDownloadZip.disabled = !hasItems || this.isProcessing;
    if (this.btnDownloadPdf) this.btnDownloadPdf.disabled = !hasItems || this.isProcessing;
    if (this.btnClearAll) this.btnClearAll.disabled = !hasItems || this.isProcessing;
  }

  clearAll() {
    if (this.items.length > 0 && !confirm('¿Deseas vaciar la lista de imágenes actual?')) {
      return;
    }
    this.items = [];
    if (this.progressCard) this.progressCard.style.display = 'none';
    this.updateUI();
    this.showToast('Lista de imágenes vaciada.', 'info');
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : (type === 'warning' ? '⚠️' : (type === 'danger' ? '✕' : 'ℹ️'));
    toast.innerHTML = `<span style="font-weight: bold;">${icon}</span><span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 350);
    }, 3800);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.manuscriptApp = new ManuscriptApp();
});
