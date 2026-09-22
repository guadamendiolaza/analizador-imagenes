# Guía Paso a Paso: Cómo Publicar Gratis en GitHub Pages

Esta guía está redactada de forma clara y sencilla para cualquier persona, incluso si nunca antes has publicado una página web o utilizado GitHub.

La aplicación **Restaurador y Mejorador de Manuscritos Históricos** es 100% estática: no necesita servidores, bases de datos, Node.js ni pagos mensuales. Puede alojarse de forma **completamente gratuita y de por vida** en **GitHub Pages**.

La dirección pública de tu aplicación tendrá el siguiente formato:
`https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`

---

## Requisitos previos (Solo necesitas 1 cosa)
- Una cuenta gratuita en [GitHub](https://github.com). Si no tienes una, regístrate con tu correo electrónico.

---

## Método 1: Publicación desde la Web de GitHub (Sin instalar nada en tu PC)

Este es el método más rápido si no utilizas la consola o Git:

### Paso 1: Crear el repositorio en GitHub
1. Inicia sesión en [GitHub.com](https://github.com).
2. En la esquina superior derecha, haz clic en el botón con el signo más **`+`** y selecciona **"New repository"** (Nuevo repositorio).
3. En el formulario:
   - **Repository name** (Nombre del repositorio): escribe un nombre sencillo en minúsculas, por ejemplo: `analizador-fotos` o `restaurador-manuscritos`.
   - **Public / Private**: Elige **Public** (Público). GitHub Pages es gratuito para repositorios públicos.
   - Marca la casilla **"Add a README file"**.
4. Haz clic en el botón verde **"Create repository"** (Crear repositorio).

### Paso 2: Subir los archivos del proyecto
1. En la página de tu repositorio recién creado, haz clic en el botón **"Add file"** y selecciona **"Upload files"** (Subir archivos).
2. Abre la carpeta de tu computadora donde está este proyecto:
   `c:\Users\PC\Downloads\ANALIZADOR FOTOS`
3. Selecciona y arrastra al navegador los siguientes archivos y carpetas:
   - `index.html`
   - `styles.css`
   - La carpeta `js` (con `app.js`, `image-processor.js`, `corner-editor.js`, `sample-data.js`)
   - `README.md`
   - `INSTRUCCIONES_GITHUB_PAGES.md`
4. En la parte inferior, en el campo de mensaje escribe: `Subida inicial de la aplicación`.
5. Haz clic en el botón verde **"Commit changes"**. Espera unos segundos a que termine de cargar todos los archivos.

### Paso 3: Activar GitHub Pages
1. Dentro de tu repositorio, haz clic en la pestaña superior **"Settings"** (Configuración, con ícono de engranaje).
2. En el menú lateral izquierdo, haz clic en **"Pages"** (bajo la sección *Code and automation*).
3. En la sección **"Build and deployment"**:
   - En **Source**, asegúrate de que esté seleccionado **"Deploy from a branch"**.
   - En **Branch**, haz clic en el desplegable donde dice *None* y selecciona **`main`** (o `master`).
   - En la carpeta de al lado, déjalo en **`/(root)`**.
   - Haz clic en el botón **"Save"** (Guardar).

### Paso 4: Obtener tu enlace y comprobar el funcionamiento
1. Espera entre **1 y 3 minutos** mientras GitHub compila y publica tu sitio.
2. Actualiza la página de *Settings > Pages*. Verás una caja verde en la parte superior que dice:
   > **"Your site is live at `https://tu-usuario.github.io/tu-repositorio/`"**
3. Haz clic en el botón **"Visit site"** o copia el enlace y ábrelo en tu navegador.
4. **Verificación de que todo funciona:**
   - Observa en la esquina superior derecha que el indicador cambie a **"Motor OpenCV listo"** (punto verde).
   - Haz clic en el botón **"✨ Probar con Ejemplos"**: se cargarán 3 documentos históricos simulados.
   - Haz clic en **"⚡ Procesar Lote"**: verás la corrección de perspectiva, eliminación del escritorio y preservación de sellos y tinta sepia.
   - Haz clic en **"📦 Descargar ZIP"**: se descargará el archivo `.zip` con los nombres terminados en `_mejorada.jpg` y el informe de auditoría.

---

## Método 2: Publicación mediante Git en la Terminal (Opcional)

Si prefieres usar la consola de comandos de Windows (PowerShell):

```bash
cd "c:\Users\PC\Downloads\ANALIZADOR FOTOS"
git init
git add .
git commit -m "Publicación inicial del Mejorador de Manuscritos"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/NOMBRE-DEL-REPOSITORIO.git
git push -u origin main
```
Luego ve a **Settings > Pages > Branch: main / (root) > Save** tal como se describe en el Paso 3.

---

## ¿Por qué funciona perfectamente en cualquier subcarpeta de GitHub?
- **Rutas relativas**: Todos los enlaces a CSS y JavaScript usan rutas relativas `./styles.css` y `./js/...`, lo que evita el error clásico de páginas en blanco en GitHub Pages cuando el repositorio está en una subcarpeta como `/analizador-fotos/`.
- **Cero dependencias de servidor**: Todo el procesamiento gráfico, cálculo de matrices y compresión ZIP ocurre en la memoria RAM del navegador del visitante.

---

## Preguntas frecuentes

1. **¿Tiene algún costo GitHub Pages?**  
   No. Es un servicio 100% gratuito proporcionado por GitHub para proyectos públicos.

2. **¿Se suben mis fotografías a internet o a GitHub?**  
   **No.** Las fotografías que proceses nunca se envían por la red. La aplicación corre dentro del navegador web de tu máquina. El repositorio en GitHub solo almacena el código HTML/JS/CSS de la herramienta, nunca tus fotos privadas ni tus documentos.

3. **¿Puedo usar la aplicación sin conexión a internet?**  
   Una vez que el navegador descarga por primera vez la página y las bibliotecas WebAssembly, quedan en la memoria caché del navegador.
