import React, { useState, useEffect } from 'react';
import './Galery.css';

const Galery = ({ images = [], onDelete }) => {
  const [openIndex, setOpenIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, index: null });

  const open = (i) => setOpenIndex(i);
  const close = () => setOpenIndex(null);

  // abrir menu contextual en la posición del cursor
  const handleContextMenu = (e, i) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, index: i });
  };

  const closeContextMenu = () => setContextMenu({ visible: false, x: 0, y: 0, index: null });

  // acciones del menu
  const actionOpen = () => {
    if (contextMenu.index != null) open(contextMenu.index);
    closeContextMenu();
  };

  const actionDownload = () => {
    const idx = contextMenu.index;
    if (idx == null) return closeContextMenu();
    const url = images[idx].src;
    const a = document.createElement('a');
    a.href = url;
    // intenta derivar nombre simple
    const name = (images[idx].title || `image-${idx}`).replace(/\s+/g, '_') + '.jpg';
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    closeContextMenu();
  };

  const actionDelete = () => {
    const idx = contextMenu.index;
    if (idx == null) return closeContextMenu();
    if (typeof onDelete === 'function') {
      onDelete(idx);
    } else {
      // si no hay callback, eliminar localmente (inmediato en UI)
      images.splice(idx, 1);
      // forzar re-render mínimo:
      setContextMenu({ visible: false, x: 0, y: 0, index: null });
      setOpenIndex(null);
    }
    closeContextMenu();
  };

  // cerrar al hacer clic fuera o al presionar Escape
  useEffect(() => {
    const onClick = (e) => {
      if (contextMenu.visible) closeContextMenu();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('click', onClick);
    window.addEventListener('contextmenu', onClick); // clic derecho en otro lado
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('contextmenu', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu.visible]);

  return (
    <div className="galery-root card">
      {images.length === 0 && (
        <p className="galery-empty">No hay imágenes. Conecta tu nube o sube fotos para verlas aquí.</p>
      )}

      <div className="galery-grid">
        {images.map((img, i) => (
          <button
            key={i}
            className="galery-item"
            onClick={() => open(i)}
            onContextMenu={(e) => handleContextMenu(e, i)}
            aria-label={img.title || `imagen-${i}`}
          >
            <img src={img.src} alt={img.title || `imagen-${i}`} loading="lazy" />
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
          <li role="menuitem" onClick={actionOpen}>Abrir</li>
          <li role="menuitem" onClick={actionDownload}>Descargar</li>
          <li role="menuitem" onClick={actionDelete}>Eliminar</li>
        </ul>
      )}

      {openIndex !== null && (
        <div className="galery-lightbox" onClick={close} role="dialog" aria-modal="true">
          <div className="galery-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="galery-close" onClick={close} aria-label="Cerrar">✕</button>
            <img src={images[openIndex].src} alt={images[openIndex].title || ''} />
            {images[openIndex].title && <div className="galery-caption">{images[openIndex].title}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Galery;
