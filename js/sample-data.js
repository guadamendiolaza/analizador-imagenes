/**
 * ==========================================================================
 * GENERADOR Y CARGADOR DE DOCUMENTOS HISTÓRICOS DE PRUEBA
 * Permite probar el flujo completo con imágenes reales adjuntas o sintéticas.
 * ==========================================================================
 */

class SampleDocumentGenerator {
  /**
   * Carga las imágenes de prueba reales o sintéticas
   */
  static async createSampleFiles() {
    const files = [];

    // 1. Intentar cargar las fotografías reales del usuario desde la carpeta muestras_reales
    try {
      const realSamples = [
        { url: './muestras_reales/media_1790115696773.jpg', name: 'Manuscrito_Folio79_Real.jpg' },
        { url: './muestras_reales/media_1790115622798.jpg', name: 'Manuscrito_AutoNotarial_Real.jpg' }
      ];

      for (const item of realSamples) {
        const resp = await fetch(item.url);
        if (resp.ok) {
          const blob = await resp.blob();
          files.push(new File([blob], item.name, { type: 'image/jpeg' }));
        }
      }
    } catch (e) {
      // Continuar con muestras generadas si hay restricciones de file://
    }

    // 2. Si no se pudieron cargar por HTTP/Fetch o si se desean muestras adicionales
    if (files.length === 0) {
      // Muestra 1: Acta notarial histórica (1842)
      const canvas1 = this.renderManuscript({
        title: "Acta de Protocolización - Año 1842",
        textLines: [
          "En la Muy Noble y Leal Ciudad de Córdoba, a veinte días del mes de Octubre,",
          "ante mí, el infrascrito Escribano Público y de Gobierno del Supremo Tribunal,",
          "compareció Don Manuel de Sotomayor y Cisneros, vecino y hacendado de esta villa,",
          "a quien doy fe de conocer, y expuso que otorga poder cumplido y suficiente,",
          "para la administración legítima de sus bienes, tierras de labor y estancias.",
          "Que así lo dijo, otorgó y firmó siendo testigos Don Francisco de Paula y",
          "Don Bartolomé de la Vega, vecinos de este distrito. Doy fe de todo lo actuado."
        ],
        folio: "Folio 14 vta.",
        sealColor: "#991b1b",
        stampText: "ARCHIVO GENERAL DE INDIAS - 1842",
        deskTilt: 4.5,
        unevenLighting: true,
        rotatePhotoDeg: 270 // Simular foto tomada de costado
      });
      files.push(await this.canvasToFile(canvas1, "Documento_1842_ActaNotarial.jpg"));

      // Muestra 2: Carta epistolar con matasellos azul (1795)
      const canvas2 = this.renderManuscript({
        title: "Correspondencia Oficial de la Real Hacienda",
        textLines: [
          "Muy Ilustre Señor Intendente General:",
          "Habiéndose verificado el cobro de las alcabalas correspondientes al tercio",
          "vencido en la tesorería de este partido, remito a V.S. los libros y padrones",
          "para su debido examen y fenecimiento de cuentas segun mandato de Su Majestad.",
          "Quedan en depósito cuatrocientos pesos fuertes y setenta reales en plata,",
          "a la espera de la orden para su transporte custodiado.",
          "Dios guarde a V.S. muchos años. - Sebastián de Ugarte."
        ],
        folio: "Pág. 37",
        sealColor: "#1e40af",
        stampText: "REAL ADUANA DE CORREOS - TARIFA 4",
        deskTilt: -3.0,
        unevenLighting: true,
        rotatePhotoDeg: 270 // Simular foto tomada de costado
      });
      files.push(await this.canvasToFile(canvas2, "Carta_1795_RealHacienda.jpg"));
    }

    return files;
  }

  static renderManuscript(config) {
    const W = 1400;
    const H = 1000;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Fondo: Mesa de madera
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#1c1611');
    bgGrad.addColorStop(0.5, '#29211a');
    bgGrad.addColorStop(1, '#15110d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((config.deskTilt || 0) * Math.PI / 180);

    const docW = 650;
    const docH = 880;
    const docX = -docW / 2;
    const docY = -docH / 2;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 35;
    ctx.shadowOffsetX = 15;
    ctx.shadowOffsetY = 20;

    const paperGrad = ctx.createLinearGradient(docX, docY, docX + docW, docY + docH);
    paperGrad.addColorStop(0, '#f4ecd8');
    paperGrad.addColorStop(0.4, '#ede0c2');
    paperGrad.addColorStop(0.7, '#f7f0df');
    paperGrad.addColorStop(1, '#e3d2aa');
    ctx.fillStyle = paperGrad;

    ctx.beginPath();
    ctx.moveTo(docX, docY);
    ctx.lineTo(docX + docW, docY + 2);
    ctx.lineTo(docX + docW - 2, docY + docH);
    ctx.lineTo(docX + 3, docY + docH - 3);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Texto y líneas manuscritas
    ctx.fillStyle = '#2f241a';
    ctx.font = 'italic 16px "Georgia", serif';
    ctx.fillText(config.folio, docX + docW - 120, docY + 55);

    ctx.font = 'bold 22px "Georgia", serif';
    ctx.textAlign = 'center';
    ctx.fillText(config.title, 0, docY + 110);

    ctx.font = '16.5px "Georgia", cursive, serif';
    ctx.textAlign = 'left';
    let lineY = docY + 180;
    const leftMargin = docX + 65;

    config.textLines.forEach((line) => {
      ctx.strokeStyle = 'rgba(160, 130, 90, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftMargin - 15, lineY + 6);
      ctx.lineTo(docX + docW - 50, lineY + 6);
      ctx.stroke();

      ctx.fillText(line, leftMargin, lineY);
      lineY += 46;
    });

    // Sello
    if (config.stampText) {
      ctx.save();
      ctx.translate(docX + 110, docY + docH - 120);
      ctx.rotate(-0.15);
      ctx.strokeStyle = config.sealColor;
      ctx.lineWidth = 3;
      ctx.fillStyle = config.sealColor;

      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("HISTORICO", 0, -18);
      ctx.fillText("OFICIAL", 0, 0);
      ctx.fillText("VALIDADO", 0, 18);
      ctx.restore();
    }

    ctx.restore();

    if (config.unevenLighting) {
      const shadowOverlay = ctx.createRadialGradient(W * 0.15, H * 0.1, 80, W * 0.8, H * 0.9, W * 0.9);
      shadowOverlay.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
      shadowOverlay.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');
      shadowOverlay.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
      ctx.fillStyle = shadowOverlay;
      ctx.fillRect(0, 0, W, H);
    }

    if (config.rotatePhotoDeg) {
      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = H;
      rotCanvas.height = W;
      const rCtx = rotCanvas.getContext('2d');
      rCtx.translate(rotCanvas.width, 0);
      rCtx.rotate(config.rotatePhotoDeg * Math.PI / 180);
      rCtx.drawImage(canvas, 0, 0);
      return rotCanvas;
    }

    return canvas;
  }

  static canvasToFile(canvas, filename) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const file = new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() });
        resolve(file);
      }, 'image/jpeg', 0.94);
    });
  }
}

window.SampleDocumentGenerator = SampleDocumentGenerator;
