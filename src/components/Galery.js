import React, { useState, useEffect, useRef } from 'react';
import './Galery.css';
import { uploadData, getUrl } from '@aws-amplify/storage';

const Galery = ({ images = [], userId = '' }) => {
  const [openIndex, setOpenIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, index: null });
  const gridRef = useRef(null);
  const itemRefs = useRef([]);
  // almacenar URLs originales ya solicitadas por índice
  const [originalUrls, setOriginalUrls] = useState({});

  const open = (i) => setOpenIndex(i);
  const close = () => setOpenIndex(null);

  const handleContextMenu = (e, i) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, index: i });
  };

  const loadOriginalImage = async (item) => {
    try {
      const path = item.path.replace(`uploads/users/${userId}/previews/`, `uploads/users/${userId}/original/`);
      const url = await getUrl({ path: path });
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

    // si ya la obtuvimos antes, abrir directamente
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
            ref={(el) => (itemRefs.current[i] = el)}
            onClick={() => openOriginal(i)}
            aria-label={img.title || `imagen-${i}`}
            style={{ width: 100, height: 100, padding: 0, borderRadius: 6, overflow: 'hidden' }}
          >
            <img
              src={img.properties?.url}
              alt={img.title || `imagen-${i}`}
              loading="lazy"
              // tamaño fijo 100x100, cubrir
              style={{ width: 100, height: 100, objectFit: 'cover', display: 'block' }}
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
            <img src={originalUrls[openIndex] || images[openIndex]?.properties?.url || images[openIndex]?.url || images[openIndex]?.src} alt={images[openIndex]?.title || ''} />
            {images[openIndex]?.title && <div className="galery-caption">{images[openIndex].title}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Galery;