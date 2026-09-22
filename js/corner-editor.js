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

    this.imageSource = null; // HTMLImageElement o Canvas
    this.imageWidth = 0;
    this.imageHeight = 0;

    // 4 esquinas en coordenadas reales de la imagen [TL, TR, BR, BL]
    this.corners = [];
    this.autoCorners = []; // Copia para restablecer
    this.activeCornerIndex = -1;
    this.hoverCornerIndex = -1;

    // Parámetros de renderizado y escala
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.handleRadius = 12;

    this.onChangeCallback = null;

    this.initEvents();
  }

  /**
   * Carga una imagen y sus 4 esquinas iniciales
   */
  loadImage(imageSource, initialCorners = null, autoCorners = null) {
    this.imageSource = imageSource;
    this.imageWidth = imageSource.width;
    this.imageHeight = imageSource.height;

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

  /**
   * Ajusta el tamaño del canvas al contenedor manteniendo la relación de aspecto
   */
  resizeCanvas() {
    if (!this.imageSource) return;

    const parent = this.canvas.parentElement;
    const maxWidth = parent.clientWidth || 800;
    const maxHeight = parent.clientHeight || 600;

    const ratio = Math.min(maxWidth / this.imageWidth, maxHeight / this.imageHeight, 1.0);
    this.scale = ratio;

    this.canvas.width = Math.round(this.imageWidth * ratio);
    this.canvas.height = Math.round(this.imageHeight * ratio);
  }

  /**
   * Conversión entre coordenadas de pantalla y coordenadas reales de imagen
   */
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

  /**
   * Renderizado completo: imagen, sombreado de descarte, polígono activo y tiradores
   */
  draw() {
    if (!this.imageSource || !this.ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // 1. Dibujar imagen de fondo escalada
    ctx.drawImage(this.imageSource, 0, 0, w, h);

    if (this.corners.length !== 4) return;

    const screenPts = this.corners.map(p => this.imageToScreen(p));

    // 2. Máscara de oscurecimiento exterior (para destacar la hoja recortada)
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, w, h);

    // Recortar polígono interior para dejar la hoja visible sin oscurecer
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    ctx.lineTo(screenPts[1].x, screenPts[1].y);
    ctx.lineTo(screenPts[2].x, screenPts[2].y);
    ctx.lineTo(screenPts[3].x, screenPts[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Dibujar líneas conectoras del documento
    ctx.save();
    ctx.strokeStyle = '#d4af37'; // Dorado antiguo
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    ctx.lineTo(screenPts[1].x, screenPts[1].y);
    ctx.lineTo(screenPts[2].x, screenPts[2].y);
    ctx.lineTo(screenPts[3].x, screenPts[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 4. Dibujar tiradores de las esquinas (Handles)
    const labels = ['TL', 'TR', 'BR', 'BL'];
    screenPts.forEach((pt, idx) => {
      const isHover = (idx === this.hoverCornerIndex);
      const isActive = (idx === this.activeCornerIndex);

      ctx.save();
      ctx.beginPath();
      const r = isHover || isActive ? this.handleRadius + 3 : this.handleRadius;
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);

      // Relleno y borde
      ctx.fillStyle = isActive ? '#3b82f6' : (isHover ? '#f59e0b' : '#1e293b');
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Punto central
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Etiqueta de esquina
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tagOffset = idx === 0 || idx === 3 ? -18 : 18;
      ctx.fillText(labels[idx], pt.x + tagOffset, pt.y);

      ctx.restore();
    });
  }

  /**
   * Actualiza y posiciona la lupa de aumento en tiempo real
   */
  updateLoupe(screenX, screenY, imagePt) {
    if (!this.loupe || !this.imageSource) return;

    this.loupe.style.display = 'block';

    // Posicionar lupa cerca del cursor evitando salirse de pantalla
    const loupeRadius = 65;
    const parentRect = this.canvas.getBoundingClientRect();
    let loupeLeft = screenX + 25;
    let loupeTop = screenY - 140;

    if (loupeTop < 0) loupeTop = screenY + 25;
    if (loupeLeft + 130 > parentRect.width) loupeLeft = screenX - 155;

    this.loupe.style.left = `${loupeLeft}px`;
    this.loupe.style.top = `${loupeTop}px`;

    // Renderizar imagen magnificada en la lupa
    const zoomLevel = 2.8;
    const bgX = -(imagePt.x * this.scale * zoomLevel) + loupeRadius;
    const bgY = -(imagePt.y * this.scale * zoomLevel) + loupeRadius;

    this.loupe.style.backgroundImage = `url(${this.canvas.toDataURL ? this.imageSource.toDataURL('image/jpeg', 0.85) : ''})`;
    this.loupe.style.backgroundSize = `${this.canvas.width * zoomLevel}px ${this.canvas.height * zoomLevel}px`;
    this.loupe.style.backgroundPosition = `${bgX}px ${bgY}px`;
  }

  hideLoupe() {
    if (this.loupe) this.loupe.style.display = 'none';
  }

  /**
   * Inicialización de eventos de mouse y táctiles
   */
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
        if (dist <= this.handleRadius + 10) return i;
      }
      return -1;
    };

    // MOUSE DOWN / TOUCH START
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

    // MOUSE MOVE / TOUCH MOVE
    const onMove = (e) => {
      const pos = getPos(e);

      if (this.activeCornerIndex !== -1) {
        // Arrastrando la esquina activa
        e.preventDefault();
        const imgPt = this.screenToImage(pos);
        this.corners[this.activeCornerIndex] = imgPt;
        this.updateLoupe(pos.x, pos.y, imgPt);
        this.draw();
        if (this.onChangeCallback) this.onChangeCallback(this.getCorners());
      } else {
        // Hovering
        const idx = findNearbyCorner(pos);
        if (idx !== this.hoverCornerIndex) {
          this.hoverCornerIndex = idx;
          this.canvas.style.cursor = idx !== -1 ? 'pointer' : 'crosshair';
          this.draw();
        }
      }
    };

    // MOUSE UP / TOUCH END
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

// Instancia global disponible
window.CornerEditor = CornerEditor;
