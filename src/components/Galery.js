import React, { useState, useEffect, useRef } from 'react';
import './Galery.css';
import { uploadData, getUrl, remove } from '@aws-amplify/storage';

const FOLDER_PREFIX = 'CODIGOUNICODECARPETASKOR';

const Galery = ({ images = [], userId = '', onDelete, onSelectFolder }) => {
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
      // Reemplazamos el segmento '/previews/' por '/original/' en la ruta, funcione con o sin carpeta intermedia
      const path = item.path.replace(/\/previews\//, '/original/');
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

    // Si el nombre del archivo de preview contiene el prefijo de carpeta,
    // interpretamos que es un botón/placeholder de carpeta: seleccionamos
    // la carpeta y recargamos la galería en ese contexto en lugar de
    // abrir el lightbox para ese placeholder.
    try {
      const filename = item.path ? item.path.split('/').pop() : '';
      if (filename && filename.startsWith(FOLDER_PREFIX)) {
        const folderPart = filename.slice(FOLDER_PREFIX.length);
        const folderName = folderPart.replace(/_/g, ' ').trim();
        if (folderName && typeof onSelectFolder === 'function') {
          onSelectFolder(folderName);
          return; // no abrir lightbox: abrimos la carpeta (se recarga la galería)
        }
      }
    } catch (e) {
      // si falla el parsing, seguimos con el comportamiento normal
      console.warn('Error parsing folder placeholder name', e);
    }

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

  // Modal-driven deletion: show confirmation modal and then delete only that file while showing busy state
  const [deleteModal, setDeleteModal] = useState({ open: false, index: null, busy: false, error: null });

  const requestDelete = (index) => {
    setDeleteModal({ open: true, index, busy: false, error: null });
  };

  const cancelDelete = () => {
    setDeleteModal({ open: false, index: null, busy: false, error: null });
  };

  const confirmDelete = async () => {
    const { index } = deleteModal;
    if (index === null || index === undefined) return;
    const item = images[index];
    if (!item) return cancelDelete();

  const previewPath = item.path;
  const originalPath = previewPath.replace(/\/previews\//, '/original/');

    setDeleteModal((s) => ({ ...s, busy: true, error: null }));
    try {
      try { await remove({ path: previewPath }); } catch (e) { console.warn('Error removing preview', e); }
      try { await remove({ path: originalPath }); } catch (e) { console.warn('Error removing original', e); }

      // limpiar caches locales
      setOriginalUrls((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });

      // cerrar modal y lightbox
      setDeleteModal({ open: false, index: null, busy: false, error: null });
      close();

      // notificar al padre para que elimine el item localmente
      try {
        if (typeof onDelete === 'function') onDelete(index, item);
      } catch (e) {
        console.warn('onDelete callback failed', e);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      setDeleteModal({ open: true, index, busy: false, error: 'Error al eliminar el archivo' });
    }
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
        {images.map((img, i) => {
          const filename = img.path ? img.path.split('/').pop() : '';
          const isFolder = filename && filename.startsWith(FOLDER_PREFIX);
          const folderLabel = isFolder ? filename.slice(FOLDER_PREFIX.length).replace(/_/g, ' ').trim() : null;

          return (
          <button
            key={i}
            className="galery-item"
            style={{ position: 'relative', overflow: 'hidden' }}
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

            {/* Si es un placeholder de carpeta, mostrar etiqueta absoluta abajo */}
            {isFolder && (
              <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.9)',
                color: '#fff',
                padding: '6px 8px',
                textAlign: 'center',
                fontSize: 14,
                lineHeight: '1.2',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>{folderLabel}</div>
            )}
          </button>
        )})}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'space-between' , border: '1px solid #ccc', borderRadius: 4, padding: 4 }}>
              <button className="galery-close" onClick={close} aria-label="Cerrar">✕</button>
              <button className="galery-delete" onClick={() => requestDelete(openIndex)} aria-label="Eliminar" title="Eliminar">🗑</button>
            </div>
            {/* Renderizar según tipo: video / pdf / imagen */}
            {(() => {
              const src = getItemSource(openIndex);
              const ext = getExtensionFromUrl(images[openIndex].path);
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

      {/* Delete confirmation modal (front of screen) */}
      {deleteModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} role="dialog" aria-modal="true">
          <div style={{ background: 'white', padding: 20, borderRadius: 8, width: '90%', maxWidth: 420, boxShadow: '0 6px 24px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirmar eliminación</div>            
            {deleteModal.error && <div style={{ color: 'red', marginBottom: 8 }}>{deleteModal.error}</div>}
            {deleteModal.busy ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>⏳</span>
                <div>Eliminando archivo...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, gap: 24 }}>
                <button onClick={cancelDelete} style={{ padding: '8px 12px' }}>Cancelar</button>
                <button onClick={confirmDelete} style={{ padding: '8px 12px', background: '#e53935', color: 'white', border: 'none', borderRadius: 4 }}>Eliminar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Galery;