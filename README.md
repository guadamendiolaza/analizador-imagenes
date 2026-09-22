# 📜 Restaurador y Mejorador por Lotes de Manuscritos Históricos

Una aplicación web completa, profesional y de código abierto para el procesamiento y restauración por lotes de fotografías JPG de documentos manuscritos antiguos (actas notariales, libros parroquiales, cartas epistolares, expedientes judiciales y documentos de archivo).

**100% en el lado del cliente (Navegador Web):** Todo el cómputo visual se realiza en tu equipo utilizando **OpenCV.js (WebAssembly)**, **ExifReader** y **JSZip**. No requiere servidores, bases de datos, claves de API pagas ni registros. Funciona de manera estática y puede alojarse gratis en **GitHub Pages**.

---

## 🌟 Características Principales (Versión 3.0)

### 1. Detección Inteligente de Orientación (Perspectiva Óptica)
- **Regla de perspectiva de captura:** En fotografías cenitales/inclinadas de documentos sobre mesas, la base de la hoja más cercana al fotógrafo se proyecta con mayor anchura. El sistema evalúa la convergencia trapezoidal y orienta la hoja a vertical con la base en la parte inferior.
- **Giro automático a vertical (270° / 90°):** Corrige automáticamente las capturas horizontales de teléfonos móviles sin perder resolución.
- **Giro en lote para fotos en revisión:** Si un grupo de fotos requiere un giro de 180° o 90°, puedes marcarlas con el botón **"⚠️ Revisar"** y girarlas todas juntas con un solo clic con **"🔄 Girar 'En Revisión' 180°"**.
- **Controles individuales:** Cada tarjeta cuenta con su botón **`↻`** para girar 90° al instante.

### 2. Detección de Contorno y Recorte con Margen Protector
- **Recorte del escritorio:** Identifica la hoja principal y elimina el fondo de la mesa de consulta o escritorio de archivo mediante segmentación y Convex Hull.
- **Corrección de perspectiva (`warpPerspective`):** Endereza la hoja eliminando la distorsión trapezoidal.
- **Margen de seguridad automático (+2.5%):** Expande los vértices hacia afuera respecto al centroide para no cercenar sellos oficiales, notas marginales, firmas ni números de folio (como *"79."* o *"75."*).
- **Editor interactivo de 4 esquinas con lupa:** Permite afinar los vértices con aumento milimétrico.

### 3. Preservación Documental y Legibilidad sin Rayas
- **Nivelación aditiva de sombras (Cero división matemática):** Corrige sombras e iluminación irregular mediante ajuste aditivo suave, eliminando de raíz las rayas, halos o bandas de ruido en el fondo y en los bordes.
- **Realce suave de tinta tenue (CLAHE 16×16):** Rescata la caligrafía desvanecida sin quemar el pergamino ni generar ruido de bloque.
- **Nitidez selectiva por umbral:** Solo realza los trazos de tinta, manteniendo la textura del papel y el fondo suaves y naturales.
- **Preservación total de colores:** Tintas sepia ferrogálicas, sellos de cera carmín y matasellos azules se conservan en su cromatismo original.

### 4. Exportación en Lote: ZIP + PDF Consolidado
- **PDF consolidado en orden original:** Genera automáticamente un único documento PDF con todos los folios en la secuencia exacta de tu carpeta, conservando las proporciones reales de cada página.
- **ZIP completo:** Descarga el archivo `.zip` que incluye tanto las imágenes individuales en alta calidad (`[nombre]_mejorada.jpg`) como el archivo `documento_completo_ordenado.pdf` y el informe de auditoría.
- **Descarga directa de PDF:** Botón exclusivo para descargar únicamente el libro o expediente en PDF con un solo clic.
- **100% Local y Privado:** Tus fotos originales en la computadora nunca se alteran ni se suben a ningún servidor.

---

## 🔍 Explicación Honesta: Casos Difíciles y Cómo Resolverlos

Ningún algoritmo de visión por computadora puede resolver el 100% de los documentos históricos de forma puramente automática sin intervención humana ocasional. A continuación se detallan los casos conocidos y cómo resolverlos desde la interfaz:

| Caso Difícil | Por qué ocurre | Cómo lo maneja la app | Solución en 5 segundos desde la UI |
| :--- | :--- | :--- | :--- |
| **Mesa del mismo color que el pergamino** | Cuando se fotografía un papel beige/amarillo sobre una mesa de madera clara o cartón del mismo tono, los gradientes de borde son casi invisibles. | El algoritmo detecta baja confianza y marca la tarjeta como **"⚠️ Requiere revisión"**, conservando el fotograma completo. | Haz clic en el ícono **📐 (Ajustar esquinas)** en la tarjeta. Arrastra las 4 esquinas a los bordes reales usando la lupa y presiona **Aplicar y Guardar**. |
| **Páginas de un libro abierto con curvatura central** | El lomo del libro genera una curva tridimensional que no es un plano perfecto. | Corrige la perspectiva general del plano de la página. | Con el botón **Margen +**, amplía el margen para asegurar que el texto cercano al lomo quede dentro del área útil. |
| **Hojas rasgadas o con esquinas faltantes** | Si una esquina fue comida por el tiempo o la humedad, no existe un vértice físico en ángulo recto. | El sistema proyecta la esquina estimada hacia afuera gracias al margen de seguridad. | En el editor de 4 esquinas, coloca el tirador donde debería continuar la proyección del papel. |
| **Fotografías tomadas de costado** | Si la cámara no registró la orientación EXIF correcta al disparar hacia abajo sobre una mesa plana. | El sistema analiza la densidad y detecta si la foto es apaisada sugiriendo el giro. | Pulsa el botón **↻ (Girar 90°)** en la tarjeta para orientar el texto en vertical inmediatamente. |

---

## 🚀 Cómo Usar la Aplicación Localmente

1. Descarga o clona esta carpeta en tu computadora.
2. Haz doble clic en el archivo `index.html` para abrirlo en cualquier navegador moderno (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari o Brave).
3. Para probar el sistema sin buscar archivos en tu disco, haz clic en el botón dorado **"✨ Probar con Ejemplos"**.
4. Para procesar tus propios documentos, haz clic en **"📁 Elegir Carpeta de Fotos"** o arrastra una colección de archivos JPG a la pantalla.

---

## 🌐 Publicación Gratuita en GitHub Pages

Consulta el archivo paso a paso:
👉 **[INSTRUCCIONES_GITHUB_PAGES.md](./INSTRUCCIONES_GITHUB_PAGES.md)**

Para desplegar tu propia versión en línea gratuita con la URL:
`https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`

---

## 🛠️ Tecnologías Empleadas

- **OpenCV.js 4.8.0**: WebAssembly para visión artificial (Canny, findContours, approxPolyDP, getPerspectiveTransform, warpPerspective, CLAHE, GaussianBlur, CIELAB).
- **ExifReader**: Extracción ultrarrápida de metadatos EXIF sin decodificación previa de píxeles.
- **JSZip 3.10.1**: Compresión y generación de paquetes ZIP en el navegador.
- **HTML5 Canvas 2D**: Visores interactivos, lupa de precisión y cortina de comparación antes/después.
- **CSS3 Puro**: Interfaz responsiva con diseño oscuro archivístico, glassmorphism y microinteracciones fluidas.
