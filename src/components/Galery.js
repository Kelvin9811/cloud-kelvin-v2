import React, { useCallback, useEffect, useRef, useState } from 'react';
import './Galery.css';
import { getUrl, remove } from '@aws-amplify/storage';

const FOLDER_PREFIX = 'CODIGOUNICODECARPETASKOR';

const Galery = ({
  images = [],
  onDelete,
  onSelectFolder,
  resolveOriginal,
  allowDelete = true,
  publicTitle = '',
}) => {
  const [openIndex, setOpenIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, index: null });
  const [viewerUrls, setViewerUrls] = useState({});
  const [downloadUrls, setDownloadUrls] = useState({});
  const [deleteModal, setDeleteModal] = useState({ open: false, index: null, busy: false, error: null });
  const [showInfo, setShowInfo] = useState(false);
  const gridRef = useRef(null);
  const itemRefs = useRef([]);

  const open = (index) => setOpenIndex(index);
  const close = () => {
    setOpenIndex(null);
    setShowInfo(false);
  };

  const getItemSource = (index) =>
    viewerUrls[index] || images[index]?.properties?.url || images[index]?.url || images[index]?.src || '';

  const getExtensionFromUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const clean = url.split('?')[0].split('#')[0];
    const parts = clean.split('.');
    if (parts.length === 1) return '';
    return parts.pop().toLowerCase();
  };

  const isVideoExt = (ext) => ['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv'].includes(ext);
  const isPdfExt = (ext) => ext === 'pdf';
  const isBrowserUnsupportedImageExt = (ext) => ['heic', 'heif'].includes(ext);
  const buildDisplayPathFromPreview = (previewPath = '') => {
    if (!previewPath) return '';
    return previewPath.replace(/\/previews\//, '/display/').replace(/\.[^.]+$/, '.jpg');
  };

  const loadOriginalImage = async (item) => {
    try {
      if (typeof resolveOriginal === 'function') {
        return await resolveOriginal(item);
      }

      const path = item.path.replace(/\/previews\//, '/original/');
      const url = await getUrl({ path });
      return url.url;
    } catch (error) {
      console.log('Error loadOriginalImage:', error);
      return null;
    }
  };

  const loadDisplayImage = async (item) => {
    try {
      const path = buildDisplayPathFromPreview(item?.path || '');
      if (!path) return null;
      const url = await getUrl({ path });
      return url.url;
    } catch (error) {
      console.log('Error loadDisplayImage:', error);
      return null;
    }
  };

  const openOriginal = async (index) => {
    const item = images[index];
    if (!item) return open(index);

    try {
      const filename = item.path ? item.path.split('/').pop() : '';
      if (filename && filename.startsWith(FOLDER_PREFIX)) {
        const folderPart = filename.slice(FOLDER_PREFIX.length);
        const folderName = folderPart.replace(/_/g, ' ').trim();
        if (folderName && typeof onSelectFolder === 'function') {
          onSelectFolder(folderName);
          return;
        }
      }
    } catch (error) {
      console.warn('Error parsing folder placeholder name', error);
    }

    const previewSrc = item?.properties?.url || item?.url || item?.src || '';
    const itemExt = getExtensionFromUrl(item.path || previewSrc);

    if (viewerUrls[index]) {
      open(index);
      return;
    }

    const url = isBrowserUnsupportedImageExt(itemExt)
      ? await loadDisplayImage(item)
      : await loadOriginalImage(item);
    if (url) {
      setViewerUrls((prev) => ({ ...prev, [index]: url.toString ? url.toString() : url }));
    }

    open(index);
  };

  const goToPrevious = useCallback(() => {
    if (openIndex === null || images.length <= 1) return;
    setShowInfo(false);
    setOpenIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [openIndex, images.length]);

  const goToNext = useCallback(() => {
    if (openIndex === null || images.length <= 1) return;
    setShowInfo(false);
    setOpenIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [openIndex, images.length]);

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
    if (!item) {
      cancelDelete();
      return;
    }

    const previewPath = item.path;
    const originalPath = previewPath.replace(/\/previews\//, '/original/');
    const displayPath = buildDisplayPathFromPreview(previewPath);

    setDeleteModal((state) => ({ ...state, busy: true, error: null }));
    try {
      try {
        await remove({ path: previewPath });
      } catch (error) {
        console.warn('Error removing preview', error);
      }

      try {
        await remove({ path: originalPath });
      } catch (error) {
        console.warn('Error removing original', error);
      }

      try {
        await remove({ path: displayPath });
      } catch (error) {
        console.warn('Error removing display', error);
      }

      setViewerUrls((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });

      setDownloadUrls((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });

      setDeleteModal({ open: false, index: null, busy: false, error: null });
      close();

      try {
        if (typeof onDelete === 'function') onDelete(index, item);
      } catch (error) {
        console.warn('onDelete callback failed', error);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      setDeleteModal({ open: true, index, busy: false, error: 'Error al eliminar el archivo' });
    }
  };

  const handleDownload = async (index) => {
    const item = images[index];
    if (!item) return;

    let url = downloadUrls[index];
    if (!downloadUrls[index]) {
      const resolved = await loadOriginalImage(item);
      if (resolved) {
        url = resolved.toString ? resolved.toString() : resolved;
        setDownloadUrls((prev) => ({ ...prev, [index]: url }));
      }
    }

    if (!url) return;

    const link = document.createElement('a');
    link.href = url;
    link.download = item.title || item.path?.split('/').pop() || `archivo-${index + 1}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const calculateSpanForImage = useCallback((imgEl, idx) => {
    if (!gridRef.current || !imgEl || !imgEl.naturalWidth) return;

    const gridWidth = gridRef.current.clientWidth;
    let columns = 4;
    let rowHeight = 40;

    if (gridWidth <= 420) {
      columns = 1;
      rowHeight = 80;
    } else if (gridWidth <= 760) {
      columns = 2;
      rowHeight = 70;
    } else if (gridWidth <= 1100) {
      columns = 3;
      rowHeight = 50;
    }

    const gap = 12;
    const totalGaps = (columns - 1) * gap;
    const columnWidth = (gridWidth - totalGaps) / columns;
    const span = Math.max(1, Math.ceil((imgEl.naturalHeight / imgEl.naturalWidth) * columnWidth / rowHeight));
    const item = itemRefs.current[idx];

    if (item) item.style.gridRowEnd = `span ${span}`;
  }, []);

  const recalcAllSpans = useCallback(() => {
    const imgs = itemRefs.current.map((item) => item?.querySelector('img')).filter(Boolean);
    imgs.forEach((imgEl, idx) => calculateSpanForImage(imgEl, idx));
  }, [calculateSpanForImage]);

  useEffect(() => {
    window.addEventListener('resize', recalcAllSpans);
    return () => window.removeEventListener('resize', recalcAllSpans);
  }, [recalcAllSpans]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, images.length);
    setTimeout(recalcAllSpans, 120);
  }, [images, recalcAllSpans]);

  useEffect(() => {
    if (openIndex === null) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenIndex(null);
        setShowInfo(false);
      } else if (event.key === 'ArrowLeft') {
        goToPrevious();
      } else if (event.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openIndex, goToNext, goToPrevious]);

  const activeItem = openIndex !== null ? images[openIndex] : null;
  const previewSrc = activeItem?.properties?.url || activeItem?.url || activeItem?.src || '';
  const activeSrc = openIndex !== null ? getItemSource(openIndex) : '';
  const activeExt = getExtensionFromUrl(activeItem?.path || activeSrc || previewSrc);
  const displaySrc = activeSrc || previewSrc;

  return (
    <div className="galery-root card" onContextMenu={(e) => e.preventDefault()}>
      {publicTitle && <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>{publicTitle}</p>}
      {images.length === 0 && <p className="galery-empty">No hay imagenes para mostrar.</p>}

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
                itemRefs.current[i] = el;
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
                onLoad={(e) => calculateSpanForImage(e.target, i)}
              />

              {isFolder && (
                <div
                  style={{
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
                    textOverflow: 'ellipsis',
                  }}
                >
                  {folderLabel}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {contextMenu.visible && (
        <ul
          className="galery-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <li
            role="menuitem"
            onClick={() => {
              setContextMenu({ visible: false, x: 0, y: 0, index: null });
              openOriginal(contextMenu.index);
            }}
          >
            Abrir
          </li>
          <li
            role="menuitem"
            onClick={() => {
              setContextMenu({ visible: false, x: 0, y: 0, index: null });
              handleDownload(contextMenu.index);
            }}
          >
            Descargar
          </li>
          {allowDelete && (
            <li
              role="menuitem"
              onClick={() => {
                setContextMenu({ visible: false, x: 0, y: 0, index: null });
                requestDelete(contextMenu.index);
              }}
            >
              Eliminar
            </li>
          )}
        </ul>
      )}

      {openIndex !== null && (
        <div className="galery-lightbox" onClick={close} role="dialog" aria-modal="true">
          <div className="galery-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="galery-toolbar">
              <div className="galery-toolbar-right">
                <button
                  className="galery-toolbar-button galery-toolbar-button-icon"
                  onClick={() => setShowInfo((prev) => !prev)}
                  aria-label="Informacion"
                  title="Informacion"
                >
                  i
                </button>
                <button
                  className="galery-toolbar-button"
                  onClick={() => handleDownload(openIndex)}
                  aria-label="Descargar"
                  title="Descargar"
                >
                  Descargar
                </button>

                {allowDelete && (
                  <button
                    className="galery-toolbar-button galery-toolbar-button-danger"
                    onClick={() => requestDelete(openIndex)}
                    aria-label="Eliminar"
                    title="Eliminar"
                  >
                    Eliminar
                  </button>
                )}

                <button
                  className="galery-toolbar-button"
                  onClick={close}
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  X
                </button>
              </div>
            </div>

            {showInfo && (
              <div className="galery-info-panel">
                <div><strong>Nombre:</strong> {activeItem?.title || 'Sin titulo'}</div>
                <div><strong>Tipo:</strong> {activeExt || 'desconocido'}</div>
                <div><strong>Ruta:</strong> {activeItem?.path || 'No disponible'}</div>
                <div><strong>Posicion:</strong> {openIndex + 1} de {images.length}</div>
              </div>
            )}

            {images.length > 1 && (
              <>
                <button
                  className="galery-nav galery-nav-left"
                  onClick={goToPrevious}
                  aria-label="Imagen anterior"
                  title="Anterior"
                >
                  {'<'}
                </button>
                <button
                  className="galery-nav galery-nav-right"
                  onClick={goToNext}
                  aria-label="Imagen siguiente"
                  title="Siguiente"
                >
                  {'>'}
                </button>
              </>
            )}

            {isVideoExt(activeExt) ? (
              <video
                controls
                src={displaySrc}
                className="galery-lightbox-media"
              >
                Tu navegador no soporta la reproduccion de este video.
              </video>
            ) : isPdfExt(activeExt) ? (
              <iframe
                src={displaySrc}
                title={activeItem?.title || `document-${openIndex}`}
                className="galery-lightbox-frame"
              />
            ) : (
              <img
                src={displaySrc}
                alt={activeItem?.title || ''}
                className="galery-lightbox-media"
              />
            )}

            {activeItem?.title && <div className="galery-caption">{activeItem.title}</div>}
          </div>
        </div>
      )}

      {allowDelete && deleteModal.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              background: 'white',
              padding: 20,
              borderRadius: 8,
              width: '90%',
              maxWidth: 420,
              boxShadow: '0 6px 24px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirmar eliminacion</div>
            {deleteModal.error && <div style={{ color: 'red', marginBottom: 8 }}>{deleteModal.error}</div>}
            {deleteModal.busy ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>...</span>
                <div>Eliminando archivo...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, gap: 24 }}>
                <button onClick={cancelDelete} style={{ padding: '8px 12px' }}>Cancelar</button>
                <button
                  onClick={confirmDelete}
                  style={{
                    padding: '8px 12px',
                    background: '#e53935',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                  }}
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Galery;
