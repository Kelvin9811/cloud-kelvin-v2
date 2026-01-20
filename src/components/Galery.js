import React, { useState, useEffect, useRef } from 'react';
import './Galery.css';

const Galery = ({ images = [], onDelete }) => {
  const [openIndex, setOpenIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, index: null });
  const pressTimer = useRef(null);
  const pressPosition = useRef({ x: 0, y: 0 });
  const ignoreClickRef = useRef(false);

  const open = (i) => setOpenIndex(i);
  const close = () => setOpenIndex(null);

  const startPress = (e, i) => {
    let x = 0, y = 0;
    if (e.touches && e.touches[0]) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else {
      x = e.clientX;
      y = e.clientY;
    }
    pressPosition.current = { x, y };
    clearPress();
    pressTimer.current = setTimeout(() => {
      setContextMenu({ visible: true, x: pressPosition.current.x, y: pressPosition.current.y, index: i });
      ignoreClickRef.current = true;
    }, 600);
  };

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const closeContextMenu = () => setContextMenu({ visible: false, x: 0, y: 0, index: null });

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
      images.splice(idx, 1);
      setContextMenu({ visible: false, x: 0, y: 0, index: null });
      setOpenIndex(null);
    }
    closeContextMenu();
  };

  useEffect(() => {
    const onClick = () => {
      if (contextMenu.visible) closeContextMenu();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu.visible]);

  return (
    <div className="galery-root card" onContextMenu={(e) => e.preventDefault()}>
      {images.length === 0 && (
        <p className="galery-empty">No hay imágenes. Conecta tu nube o sube fotos para verlas aquí.</p>
      )}

      <div className="galery-grid">
        {images.map((img, i) => (
          <button
            key={i}
            className="galery-item"
            onClick={(e) => {
              if (ignoreClickRef.current) {
                ignoreClickRef.current = false;
                return;
              }
              open(i);
            }}
            onMouseDown={(e) => startPress(e, i)}
            onMouseUp={() => {
              clearPress();
            }}
            onMouseLeave={() => {
              clearPress();
            }}
            onTouchStart={(e) => startPress(e, i)}
            onTouchEnd={() => {
              clearPress();
            }}
            onTouchMove={() => {
              clearPress();
            }}
            onContextMenu={(e) => e.preventDefault()}
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
