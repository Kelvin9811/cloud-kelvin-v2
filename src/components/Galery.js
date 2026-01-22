import React, { useState, useEffect, useRef } from 'react';
import './Galery.css';
import { uploadData, getUrl } from '@aws-amplify/storage';

const Galery = ({ images = [], userId = '' }) => {
  const [openIndex, setOpenIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, index: null });
  const gridRef = useRef(null);
  const itemRefs = useRef([]);
  const [originalUrls, setOriginalUrls] = useState({});

  const open = (i) => setOpenIndex(i);
  const close = () => setOpenIndex(null);

  // helpers para tipo de archivo
  const getItemSource = (index) =>
    originalUrls[index] || images[index]?.properties?.url || images[index]?.url || images[index]?.src || '';

  const getExtensionFromUrl = (url) => {

    if (!url || typeof url !== 'string') return '';
    const clean = url.split('?')[0].split('#')[0];
    const parts = clean.split('.');
    if (parts.length === 1) return '';
    console.log('getExtensionFromUrl:', url, '->', parts.pop().toLowerCase());
    return parts.pop().toLowerCase();
  };

  const isVideoExt = (ext) => ['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv'].includes(ext);
  const isPdfExt = (ext) => ext === 'pdf';

  const handleContextMenu = (e, i) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, index: i });
  };

  const loadOriginalImage = async (item) => {
    try {
      const path = item.path.replace(`uploads/users/${userId}/previews/`, `uploads/users/${userId}/original/`);
      console.log('loadOriginalImage for path:', path);
      const url = await getUrl({ path: path });
      console.log('Original image URL:', url);
      return url.url;
    } catch (error) {
      console.log('Error loadOriginalImage:', error);
      return null;
    }
  };

  // abre la imagen original: obtiene URL (si no está cacheada), la guarda y abre el lightbox
  const openOriginal = async (index) => {
    const item = images[index];
    if (!item) return open(index); // fallback

    console.log('openOriginal for index:', index, item);
    if (originalUrls[index]) {
      open(index);
      return;
    }

    const url = await loadOriginalImage(item);
    if (url) {
      setOriginalUrls((prev) => ({ ...prev, [index]: url }));
    }
    open(index); // abrir aunque no haya URL (usa preview)
  };

  // --- NUEVO: cálculo dinámico de rows para un layout tipo "masonry" ---
  const calculateSpanForImage = (imgEl, idx) => {
    if (!gridRef.current || !imgEl || !imgEl.naturalWidth) return;
    const gridWidth = gridRef.current.clientWidth;
    let columns = 4;
    let rowHeight = 40; // debe coincidir con grid-auto-rows en CSS
    if (gridWidth <= 420) {
      columns = 1;
      rowHeight = 80;
    }
    else if (gridWidth <= 760) {
      columns = 2;
      rowHeight = 70;
    }
    else if (gridWidth <= 1100) {
      columns = 3;
      rowHeight = 50;
    }
    const gap = 12;
    const totalGaps = (columns - 1) * gap;
    const columnWidth = (gridWidth - totalGaps) / columns;
    const span = Math.max(1, Math.ceil((imgEl.naturalHeight / imgEl.naturalWidth) * columnWidth / rowHeight));
    const item = itemRefs.current[idx];
    if (item) item.style.gridRowEnd = `span ${span}`;
  };

  const recalcAllSpans = () => {
    const imgs = itemRefs.current.map((it) => it?.querySelector('img')).filter(Boolean);
    imgs.forEach((imgEl, idx) => calculateSpanForImage(imgEl, idx));
  };

  useEffect(() => {
    window.addEventListener('resize', recalcAllSpans);
    return () => window.removeEventListener('resize', recalcAllSpans);
  }, []);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, images.length);
    // recalcular tras montar imágenes
    setTimeout(recalcAllSpans, 120);
  }, [images]);
  // --- FIN NUEVO ---

  return (
    <div className="galery-root card" onContextMenu={(e) => e.preventDefault()}>
      {images.length === 0 && (
        <p className="galery-empty">No hay imágenes. Conecta tu nube o sube fotos para verlas aquí.</p>
      )}

      <div className="galery-grid" ref={gridRef}>
        {images.map((img, i) => (
          <button
            key={i}
            className="galery-item"
            ref={(el) => {
              // asignar ref
              itemRefs.current[i] = el;
              // si la imagen ya está cargada (por caché), calcular inmediatamente el span
              const imgEl = el?.querySelector('img');
              if (imgEl && imgEl.complete && imgEl.naturalWidth) {
                calculateSpanForImage(imgEl, i);
              }
            }}

            onClick={() => openOriginal(i)}
            aria-label={img.title || `imagen-${i}`}
          >
            <img
              src={img.properties?.url || img.url || img.src}
              alt={img.title || `imagen-${i}`}
              loading="lazy"
              // al cargar la imagen calculamos el span para el grid (dinámico)
              onLoad={(e) => calculateSpanForImage(e.target, i)}
            />
          </button>
        ))}
      </div>

      {contextMenu.visible && (
        <ul
          className="galery-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <li role="menuitem" onClick={() => { setContextMenu({ visible: false, x: 0, y: 0, index: null }); openOriginal(contextMenu.index); }}>Abrir</li>
          <li role="menuitem" onClick={() => { /* ...existing download logic... */ }}>Descargar</li>
          <li role="menuitem" onClick={() => { /* ...existing delete logic... */ }}>Eliminar</li>
        </ul>
      )}

      {openIndex !== null && (
        <div className="galery-lightbox" onClick={close} role="dialog" aria-modal="true">
          <div className="galery-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="galery-close" onClick={close} aria-label="Cerrar">✕</button>
            {/* Renderizar según tipo: video / pdf / imagen */}
            {(() => {
              console.log('Rendering lightbox for index:', images[openIndex].path);
              const src = getItemSource(openIndex);
              console.log('Item source URL:', src);
              const ext = getExtensionFromUrl(images[openIndex].path);
              console.log('Determined extension:', ext);
              if (isVideoExt(ext)) {
                return (
                  <video
                    controls
                    src={src || images[openIndex]?.properties?.url || images[openIndex]?.url || images[openIndex]?.src}
                    style={{ maxWidth: '100%', maxHeight: '80vh' }}
                  >
                    Tu navegador no soporta la reproducción de este vídeo.
                  </video>
                );
              }

              if (isPdfExt(ext)) {
                return (
                  <iframe
                    src={src || images[openIndex]?.properties?.url || images[openIndex]?.url || images[openIndex]?.src}
                    title={images[openIndex]?.title || `document-${openIndex}`}
                    style={{ width: '100%', height: '80vh', border: 'none' }}
                  />
                );
              }

              // fallback: imagen
              return (
                <img
                  src={src || images[openIndex]?.properties?.url || images[openIndex]?.url || images[openIndex]?.src}
                  alt={images[openIndex]?.title || ''}
                />
              );
            })()}

            {images[openIndex]?.title && <div className="galery-caption">{images[openIndex].title}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Galery;