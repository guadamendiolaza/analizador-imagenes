/**
 * ==========================================================================
 * EDITOR INTERACTIVO DE 4 ESQUINAS CON LUPA DE PRECISIÓN
 * Permite ajustar con precisión milimétrica los vértices del documento.
 * ==========================================================================
 */

class CornerEditor {
  constructor(canvasElement, loupeElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.loupe = loupeElement;

    this.imageSource = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.cachedDataUrl = null;

    // 4 esquinas en coordenadas reales de la imagen [TL, TR, BR, BL]
    this.corners = [];
    this.autoCorners = [];
    this.activeCornerIndex = -1;
    this.hoverCornerIndex = -1;

    this.scale = 1.0;
    this.handleRadius = 13;
    this.onChangeCallback = null;

    this.initEvents();
  }

  loadImage(imageSource, initialCorners = null, autoCorners = null) {
    this.imageSource = imageSource;
    this.imageWidth = imageSource.naturalWidth || imageSource.width || 800;
    this.imageHeight = imageSource.naturalHeight || imageSource.height || 600;

    // Cachear el dataURL una sola vez al cargar la imagen para evitar spam en mousemove
    try {
      this.cachedDataUrl = imageSource.toDataURL ? imageSource.toDataURL('image/jpeg', 0.85) : imageSource.src;
    } catch (_) {
      this.cachedDataUrl = null;
    }

    if (initialCorners && initialCorners.length === 4) {
      this.corners = JSON.parse(JSON.stringify(initialCorners));
    } else {
      this.resetToFullFrame();
    }

    if (autoCorners && autoCorners.length === 4) {
      this.autoCorners = JSON.parse(JSON.stringify(autoCorners));
    } else {
      this.autoCorners = JSON.parse(JSON.stringify(this.corners));
    }

    this.resizeCanvas();
    this.draw();
  }

  setOnChange(callback) {
    this.onChangeCallback = callback;
  }

  getCorners() {
    return JSON.parse(JSON.stringify(this.corners));
  }

  setCorners(newCorners) {
    if (newCorners && newCorners.length === 4) {
      this.corners = JSON.parse(JSON.stringify(newCorners));
      this.draw();
      if (this.onChangeCallback) this.onChangeCallback(this.getCorners());
    }
  }

  resetToAuto() {
    if (this.autoCorners && this.autoCorners.length === 4) {
      this.corners = JSON.parse(JSON.stringify(this.autoCorners));
      this.draw();
      if (this.onChangeCallback) this.onChangeCallback(this.getCorners());
    }
  }

  resetToFullFrame() {
    this.corners = [
      { x: 0, y: 0 },
      { x: this.imageWidth - 1, y: 0 },
      { x: this.imageWidth - 1, y: this.imageHeight - 1 },
      { x: 0, y: this.imageHeight - 1 }
    ];
    this.draw();
    if (this.onChangeCallback) this.onChangeCallback(this.getCorners());
  }

  adjustMargin(percentDelta) {
    if (!this.corners || this.corners.length !== 4) return;
    const cx = (this.corners[0].x + this.corners[1].x + this.corners[2].x + this.corners[3].x) / 4;
    const cy = (this.corners[0].y + this.corners[1].y + this.corners[2].y + this.corners[3].y) / 4;

    this.corners = this.corners.map(pt => {
      const vx = pt.x - cx;
      const vy = pt.y - cy;
      return {
        x: Math.max(0, Math.min(this.imageWidth - 1, Math.round(cx + vx * (1 + percentDelta)))),
        y: Math.max(0, Math.min(this.imageHeight - 1, Math.round(cy + vy * (1 + percentDelta))))
      };
    });

    this.draw();
    if (this.onChangeCallback) this.onChangeCallback(this.getCorners());
  }

  resizeCanvas() {
    if (!this.imageSource || !this.canvas.parentElement) return;

    const parent = this.canvas.parentElement;
    const maxWidth = parent.clientWidth || 800;
    const maxHeight = parent.clientHeight || 600;

    const ratio = Math.min(maxWidth / this.imageWidth, maxHeight / this.imageHeight, 1.0);
    this.scale = ratio;

    this.canvas.width = Math.round(this.imageWidth * ratio);
    this.canvas.height = Math.round(this.imageHeight * ratio);
  }

  imageToScreen(pt) {
    return {
      x: pt.x * this.scale,
      y: pt.y * this.scale
    };
  }

  screenToImage(pt) {
    return {
      x: Math.max(0, Math.min(this.imageWidth - 1, Math.round(pt.x / this.scale))),
      y: Math.max(0, Math.min(this.imageHeight - 1, Math.round(pt.y / this.scale)))
    };
  }

  draw() {
    if (!this.imageSource || !this.ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.imageSource, 0, 0, w, h);

    if (this.corners.length !== 4) return;

    const screenPts = this.corners.map(p => this.imageToScreen(p));

    // Máscara oscura exterior
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, w, h);

    // Despejar área de la hoja
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    ctx.lineTo(screenPts[1].x, screenPts[1].y);
    ctx.lineTo(screenPts[2].x, screenPts[2].y);
    ctx.lineTo(screenPts[3].x, screenPts[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Líneas conectoras doradas
    ctx.save();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    ctx.lineTo(screenPts[1].x, screenPts[1].y);
    ctx.lineTo(screenPts[2].x, screenPts[2].y);
    ctx.lineTo(screenPts[3].x, screenPts[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Tiradores de las 4 esquinas
    const labels = ['TL', 'TR', 'BR', 'BL'];
    screenPts.forEach((pt, idx) => {
      const isHover = (idx === this.hoverCornerIndex);
      const isActive = (idx === this.activeCornerIndex);

      ctx.save();
      ctx.beginPath();
      const r = isHover || isActive ? this.handleRadius + 3 : this.handleRadius;
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);

      ctx.fillStyle = isActive ? '#3b82f6' : (isHover ? '#f59e0b' : '#d4af37');
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tagOffset = (idx === 0 || idx === 1) ? -18 : 18;
      ctx.fillText(labels[idx], pt.x, pt.y + tagOffset);
      ctx.restore();
    });
  }

  updateLoupe(screenX, screenY, imagePt) {
    if (!this.loupe || !this.imageSource || !this.cachedDataUrl) return;

    this.loupe.style.display = 'block';

    const loupeRadius = 65;
    const parentRect = this.canvas.parentElement.getBoundingClientRect();
    let loupeLeft = screenX + 25;
    let loupeTop = screenY - 140;

    if (loupeTop < 0) loupeTop = screenY + 25;
    if (loupeLeft + 130 > parentRect.width) loupeLeft = screenX - 155;

    this.loupe.style.left = `${loupeLeft}px`;
    this.loupe.style.top = `${loupeTop}px`;

    const zoomLevel = 2.5;
    const bgX = -(imagePt.x * this.scale * zoomLevel) + loupeRadius;
    const bgY = -(imagePt.y * this.scale * zoomLevel) + loupeRadius;

    this.loupe.style.backgroundImage = `url(${this.cachedDataUrl})`;
    this.loupe.style.backgroundSize = `${this.canvas.width * zoomLevel}px ${this.canvas.height * zoomLevel}px`;
    this.loupe.style.backgroundPosition = `${bgX}px ${bgY}px`;
  }

  hideLoupe() {
    if (this.loupe) this.loupe.style.display = 'none';
  }

  initEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const findNearbyCorner = (pos) => {
      for (let i = 0; i < this.corners.length; i++) {
        const screenPt = this.imageToScreen(this.corners[i]);
        const dist = Math.hypot(screenPt.x - pos.x, screenPt.y - pos.y);
        if (dist <= this.handleRadius + 12) return i;
      }
      return -1;
    };

    const onStart = (e) => {
      const pos = getPos(e);
      const idx = findNearbyCorner(pos);
      if (idx !== -1) {
        this.activeCornerIndex = idx;
        e.preventDefault();
        const imgPt = this.screenToImage(pos);
        this.updateLoupe(pos.x, pos.y, imgPt);
        this.draw();
      }
    };

    const onMove = (e) => {
      const pos = getPos(e);

      if (this.activeCornerIndex !== -1) {
        e.preventDefault();
        const imgPt = this.screenToImage(pos);
        this.corners[this.activeCornerIndex] = imgPt;
        this.updateLoupe(pos.x, pos.y, imgPt);
        this.draw();
        if (this.onChangeCallback) this.onChangeCallback(this.getCorners());
      } else {
        const idx = findNearbyCorner(pos);
        if (idx !== this.hoverCornerIndex) {
          this.hoverCornerIndex = idx;
          this.canvas.style.cursor = idx !== -1 ? 'pointer' : 'default';
          this.draw();
        }
      }
    };

    const onEnd = () => {
      if (this.activeCornerIndex !== -1) {
        this.activeCornerIndex = -1;
        this.hideLoupe();
        this.draw();
      }
    };

    this.canvas.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    this.canvas.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    window.addEventListener('resize', () => {
      if (this.imageSource) {
        this.resizeCanvas();
        this.draw();
      }
    });
  }
}

window.CornerEditor = CornerEditor;
