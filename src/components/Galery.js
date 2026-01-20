import React, { useState } from 'react';
import './Galery.css';

const Galery = ({ images = [] }) => {
  const [openIndex, setOpenIndex] = useState(null);

  const open = (i) => setOpenIndex(i);
  const close = () => setOpenIndex(null);

  return (
    <div className="galery-root card">
      <h3 className="galery-title">Mi Nube — Galería</h3>

      {images.length === 0 && (
        <p className="galery-empty">No hay imágenes. Conecta tu nube o sube fotos para verlas aquí.</p>
      )}

      <div className="galery-grid">
        {images.map((img, i) => (
          <button key={i} className="galery-item" onClick={() => open(i)} aria-label={img.title || `imagen-${i}`}>
            <img src={img.src} alt={img.title || `imagen-${i}`} loading="lazy" />
          </button>
        ))}
      </div>

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
