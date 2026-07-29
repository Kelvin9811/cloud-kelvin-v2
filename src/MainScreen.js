import React, { useEffect, useRef, useState } from 'react';
import Galery from './components/Galery';
import UploadPage from './components/UploadPage';
import './App.css';
import './components/UploadPage.css';
import carpetaLogo from './images/carpeta_logo.jpg';
import backButtonImage from './images/back-button.png';
import { getUrl, list, remove, uploadData } from '@aws-amplify/storage';
import { getShareStatus, publishShare, unpublishShare } from './shareApi';
import { prepareFolderUpload } from './folderUpload';

const FOLDER_PREFIX = 'CODIGOUNICODECARPETASKOR';
const PAGE_SIZE = 20;

const getFilenameFromPath = (path = '') => path.split('/').pop() || '';
const getFolderPlaceholderName = (folderName = '') => `${FOLDER_PREFIX}${(folderName || '').trim()}`.replace(/\s+/g, '_');

const parseUploadDateFromFilename = (path = '') => {
  const filename = getFilenameFromPath(path);
  const match = filename.match(/^(\d{8})_(\d{6})_/);
  if (!match) return null;

  const datePart = match[1];
  const timePart = match[2];

  return new Date(
    Number(datePart.slice(0, 4)),
    Number(datePart.slice(4, 6)) - 1,
    Number(datePart.slice(6, 8)),
    Number(timePart.slice(0, 2)),
    Number(timePart.slice(2, 4)),
    Number(timePart.slice(4, 6))
  ).getTime();
};

const sortPreviewItems = (items = []) => {
  return [...items].sort((a, b) => {
    const aFilename = getFilenameFromPath(a.path);
    const bFilename = getFilenameFromPath(b.path);
    const aIsFolder = aFilename.startsWith(FOLDER_PREFIX);
    const bIsFolder = bFilename.startsWith(FOLDER_PREFIX);

    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;

    if (aIsFolder && bIsFolder) {
      return aFilename.localeCompare(bFilename);
    }

    const aDate = parseUploadDateFromFilename(a.path) ?? 0;
    const bDate = parseUploadDateFromFilename(b.path) ?? 0;
    if (aDate !== bDate) return bDate - aDate;

    return bFilename.localeCompare(aFilename);
  });
};

const MainScreen = ({ user, signOut }) => {
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const folderPickerRef = useRef(null);
  const [pendingFolderUpload, setPendingFolderUpload] = useState(null);

  const [allImages, setAllImages] = useState([]);
  const [images, setImages] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const didLoadRef = useRef(false);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [addFolderModalOpen, setAddFolderModalOpen] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [folderError, setFolderError] = useState(null);
  const [shareState, setShareState] = useState({
    loading: false,
    action: '',
    shared: false,
    shareId: null,
    publicUrlPath: '',
  });
  const [deleteFolderState, setDeleteFolderState] = useState({ open: false, busy: false, error: null });
  const [shareLinkModal, setShareLinkModal] = useState({ open: false, url: '', copied: false });
  const [backBtnSize, setBackBtnSize] = useState(40);

  useEffect(() => {
    const computeSize = () => {
      try {
        const minSide = Math.min(window.innerWidth || 800, window.innerHeight || 600);
        const size = Math.max(32, Math.min(72, Math.round(minSide * 0.05)));
        setBackBtnSize(size);
      } catch {
        setBackBtnSize(40);
      }
    };

    computeSize();
    window.addEventListener('resize', computeSize, { passive: true });
    return () => window.removeEventListener('resize', computeSize);
  }, []);

  const getPreviewListPath = (userId, folderOverride = null) => {
    if (!userId) return '';
    const folder = folderOverride !== null ? folderOverride : currentFolder;
    if (folder) return `uploads/users/${userId}/${folder}/previews/`;
    return `uploads/users/${userId}/previews/`;
  };

  const getPublicShareUrl = (publicUrlPath) => {
    if (!publicUrlPath) return '';
    return `${window.location.origin}${publicUrlPath}`;
  };

  const openShareLinkModal = (publicUrlPath) => {
    const url = getPublicShareUrl(publicUrlPath);
    if (!url) return;
    setShareLinkModal({ open: true, url, copied: false });
  };

  const closeShareLinkModal = () => {
    setShareLinkModal({ open: false, url: '', copied: false });
  };

  const listAllItemsForPath = async (path) => {
    const allItems = [];
    let currentToken;

    do {
      const result = await list({
        path,
        options: { pageSize: 1000, nextToken: currentToken }
      });

      allItems.push(...(result.items || []));
      currentToken = result.nextToken || undefined;
    } while (currentToken);

    return allItems;
  };

  const listAllPreviewItems = async (userId, folderOverride = null) => {
    return listAllItemsForPath(getPreviewListPath(userId, folderOverride));
  };

  const folderHasShareableItems = async (userId, folderName) => {
    if (!userId || !folderName) return false;

    const result = await list({
      path: `uploads/users/${userId}/${folderName}/previews/`,
      options: { pageSize: 50 }
    });

    return (result.items || []).some((item) => {
      const filename = getFilenameFromPath(item.path);
      return filename && !filename.startsWith(FOLDER_PREFIX);
    });
  };

  const applyLocalPagination = (sortedItems, offset = 0) => {
    const nextOffset = offset + PAGE_SIZE;
    const nextPage = sortedItems.slice(offset, nextOffset);
    setImages((prev) => (offset === 0 ? nextPage : [...prev, ...nextPage]));
    setNextToken(nextOffset < sortedItems.length ? String(nextOffset) : null);
  };

  const loadMoreImages = () => {
    if (loading || !nextToken) return;
    const offset = Number(nextToken);
    if (Number.isNaN(offset)) return;
    applyLocalPagination(allImages, offset);
  };

  const loadImages = async (userId, folderOverride = null) => {
    if (!userId || loading) return;

    setLoading(true);
    try {
      const items = await listAllPreviewItems(userId, folderOverride);
      const itemsMapped = await Promise.all(
        items.map(async (item) => ({
          properties: await getUrl({ path: item.path }),
          path: item.path
        }))
      );

      const sortedItems = sortPreviewItems(itemsMapped);
      setAllImages(sortedItems);
      applyLocalPagination(sortedItems, 0);
    } catch (error) {
      console.error('Error loading images:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetAndLoadImages = (userId, folderOverride = null) => {
    setAllImages([]);
    setImages([]);
    setNextToken(null);
    setLoading(false);
    didLoadRef.current = false;
    if (userId) loadImages(userId, folderOverride);
  };

  const resetAndLoadImagesHome = (userId) => {
    setCurrentFolder(null);
    resetAndLoadImages(userId, '');
  };

  const refreshShareState = async (folderName) => {
    if (!user?.userId || !folderName) {
      setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
      return;
    }

    setShareState((prev) => ({ ...prev, loading: true, action: 'status' }));
    try {
      const hasShareableItems = await folderHasShareableItems(user.userId, folderName);
      if (!hasShareableItems) {
        console.log('[MainScreen] Skipping share status for empty folder', { folderName });
        setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
        return;
      }

      const status = await getShareStatus({ userId: user.userId, folderName });
      setShareState({
        loading: false,
        action: '',
        shared: Boolean(status.shared),
        shareId: status.shareId || null,
        publicUrlPath: status.publicUrlPath || '',
      });
    } catch (error) {
      console.error('Error loading share status:', error);
      setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
    }
  };

  const handlePublishFolder = async () => {
    if (!user?.userId || !currentFolder) return;

    setShareState((prev) => ({ ...prev, loading: true, action: 'publish' }));
    try {
      const hasShareableItems = await folderHasShareableItems(user.userId, currentFolder);
      if (!hasShareableItems) {
        console.warn('[MainScreen] Cannot publish empty folder', { currentFolder });
        setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
        return;
      }

      const result = await publishShare({ userId: user.userId, folderName: currentFolder });
      setShareState({
        loading: false,
        action: '',
        shared: true,
        shareId: result.shareId || null,
        publicUrlPath: result.publicUrlPath || '',
      });
      openShareLinkModal(result.publicUrlPath || '');
    } catch (error) {
      console.error('Error publishing folder:', error);
      setShareState((prev) => ({ ...prev, loading: false, action: '' }));
    }
  };

  const handleUnpublishFolder = async () => {
    if (!user?.userId || !currentFolder) return;

    setShareState((prev) => ({ ...prev, loading: true, action: 'unpublish' }));
    try {
      await unpublishShare({ userId: user.userId, folderName: currentFolder });
      setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
    } catch (error) {
      console.error('Error unpublishing folder:', error);
      setShareState((prev) => ({ ...prev, loading: false, action: '' }));
    }
  };

  const handleCopyShareLinkFromModal = async () => {
    if (!shareLinkModal.url) return;

    try {
      await navigator.clipboard.writeText(shareLinkModal.url);
      setShareLinkModal((prev) => ({ ...prev, copied: true }));
    } catch (error) {
      console.error('Error copying share link from modal:', error);
    }
  };

  const handleSetFolderFromButton = (folderName) => {
    const name = (folderName || '').trim();
    if (!name) return;

    setCurrentFolder(name);
    setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
    resetAndLoadImages(user?.userId, name);
  };

  const handleAddFolder = () => {
    setFolderInput('');
    setFolderError(null);
    setAddFolderModalOpen(true);
  };

  const closeAddFolderModal = () => {
    setAddFolderModalOpen(false);
    setFolderInput('');
    setFolderError(null);
  };

  const createFolderPlaceholder = async (folderName) => {
    const userId = user?.userId;
    if (!userId) {
      throw new Error('No se encontro el usuario para crear la carpeta');
    }

    const previewPath = `uploads/users/${userId}/previews/${getFolderPlaceholderName(folderName)}`;
    const response = await fetch(carpetaLogo);
    const blob = await response.blob();

    await uploadData({
      path: previewPath,
      data: blob,
      options: { contentType: 'image/jpeg' }
    }).result;
  };

  const createFolder = async (folderName) => {
    const name = (folderName || '').trim();
    if (!name) {
      setFolderError('El nombre de la carpeta no puede estar vacio');
      return;
    }

    try {
      const userId = user?.userId;
      await createFolderPlaceholder(name);
      setCurrentFolder(name);
      setPendingFolderUpload(null);
      setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
      closeAddFolderModal();
      resetAndLoadImages(userId, name);
    } catch (error) {
      console.error('Error creando carpeta:', error);
      setFolderError('No se pudo crear la carpeta');
    }
  };

  const handleFolderSelection = async (event) => {
    const selection = prepareFolderUpload(event.target.files);
    event.target.value = '';

    if (!selection.folderName) {
      setFolderInput('');
      setFolderError('No se pudo reconocer la carpeta seleccionada');
      setAddFolderModalOpen(true);
      return;
    }

    if (selection.files.length === 0) {
      setFolderInput(selection.folderName);
      setFolderError('La carpeta no contiene archivos directos. Los archivos de subcarpetas no se cargan.');
      setAddFolderModalOpen(true);
      return;
    }

    try {
      await createFolderPlaceholder(selection.folderName);
      const ignoredMessage = selection.ignoredCount > 0
        ? ` Se ignoraron ${selection.ignoredCount} archivo${selection.ignoredCount === 1 ? '' : 's'} de subcarpetas.`
        : '';

      setPendingFolderUpload({
        id: `${selection.folderName}-${Date.now()}`,
        folderName: selection.folderName,
        files: selection.files,
        notice: `Carpeta "${selection.folderName}" preparada con ${selection.files.length} archivo${selection.files.length === 1 ? '' : 's'} directo${selection.files.length === 1 ? '' : 's'}.${ignoredMessage}`,
      });
      setCurrentFolder(selection.folderName);
      setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
      setSelected('upload');
    } catch (error) {
      console.error('Error preparando carpeta para carga:', error);
      setFolderInput(selection.folderName);
      setFolderError('No se pudo crear la carpeta en la nube');
      setAddFolderModalOpen(true);
    }
  };

  const openDeleteFolderModal = () => {
    setDeleteFolderState({ open: true, busy: false, error: null });
    setMenuOpen(false);
  };

  const closeDeleteFolderModal = () => {
    if (deleteFolderState.busy) return;
    setDeleteFolderState({ open: false, busy: false, error: null });
  };

  const handleDeleteFolder = async () => {
    if (!user?.userId || !currentFolder) return;

    const folderName = currentFolder;
    const userId = user.userId;
    const placeholderPath = `uploads/users/${userId}/previews/${getFolderPlaceholderName(folderName)}`;
    const previewBasePath = `uploads/users/${userId}/${folderName}/previews/`;
    const originalBasePath = `uploads/users/${userId}/${folderName}/original/`;
    const displayBasePath = `uploads/users/${userId}/${folderName}/display/`;

    setDeleteFolderState({ open: true, busy: true, error: null });

    try {
      if (shareState.shared) {
        try {
          await unpublishShare({ userId, folderName });
        } catch (error) {
          console.warn('No se pudo despublicar antes de eliminar la carpeta', error);
        }
      }

      const [previewItems, originalItems, displayItems] = await Promise.all([
        listAllItemsForPath(previewBasePath),
        listAllItemsForPath(originalBasePath),
        listAllItemsForPath(displayBasePath),
      ]);

      const uniquePaths = [...new Set([
        ...previewItems.map((item) => item.path).filter(Boolean),
        ...originalItems.map((item) => item.path).filter(Boolean),
        ...displayItems.map((item) => item.path).filter(Boolean),
        placeholderPath,
      ])];

      await Promise.all(uniquePaths.map(async (path) => {
        try {
          await remove({ path });
        } catch (error) {
          console.warn('Error eliminando ruta de carpeta', { path, error });
        }
      }));

      setDeleteFolderState({ open: false, busy: false, error: null });
      setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
      setCurrentFolder(null);
      resetAndLoadImagesHome(userId);
    } catch (error) {
      console.error('Error deleting folder:', error);
      setDeleteFolderState({ open: true, busy: false, error: 'No se pudo eliminar la carpeta completa' });
    }
  };

  const handleDeleteLocal = (index, item) => {
    setAllImages((prev) => {
      const updated = prev.filter((entry) => entry.path !== item?.path);
      setNextToken(images.length < updated.length ? String(images.length) : null);
      return updated;
    });
    setImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;

    setAllImages([]);
    setImages([]);
    setNextToken(null);
    setLoading(false);
    if (user?.userId) loadImages(user.userId, null);
  }, [user]);

  useEffect(() => {
    if (!currentFolder || !user?.userId) {
      setShareState({ loading: false, action: '', shared: false, shareId: null, publicUrlPath: '' });
      return;
    }

    refreshShareState(currentFolder);
  }, [currentFolder, user]);

  useEffect(() => {
    const onScroll = () => {
      if (loading || !nextToken) return;

      const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 300);
      if (nearBottom) {
        loadMoreImages();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [nextToken, loading, allImages]);

  useEffect(() => {
    const onDocClick = (event) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  return (
    <div className="App">
      <div className="main-content" style={{ position: 'relative' }}>
        {currentFolder && (
          <button
            onClick={() => {
              setSelected(null);
              resetAndLoadImagesHome(user?.userId);
            }}
            aria-label="Volver a la raiz"
            title="Volver"
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 1100,
              background: 'rgba(255,255,255,0.9)',
              color: '#000',
              border: 'none',
              borderRadius: Math.max(6, Math.round(backBtnSize * 0.18)),
              cursor: 'pointer',
              height: backBtnSize,
              width: backBtnSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <img
              src={backButtonImage}
              alt="Volver"
              style={{ height: Math.round(backBtnSize * 0.55), width: Math.round(backBtnSize * 0.55) }}
            />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="greeting">
            Hola <strong>{user?.username}</strong>{currentFolder ? ` Carpeta ${currentFolder}` : ''}
          </span>
        </div>

        {selected === 'upload' ? (
          <UploadPage
            key={pendingFolderUpload?.id || `manual-${currentFolder || 'root'}`}
            userId={user?.userId}
            currentFolder={currentFolder}
            initialFiles={pendingFolderUpload?.files || []}
            initialNotice={pendingFolderUpload?.notice || ''}
            onBack={() => {
              setSelected(null);
              setPendingFolderUpload(null);
              if (currentFolder) {
                resetAndLoadImages(user?.userId, currentFolder);
              } else {
                resetAndLoadImagesHome(user?.userId);
              }
            }}
          />
        ) : (
          <Galery images={images} onDelete={handleDeleteLocal} onSelectFolder={handleSetFolderFromButton} />
        )}
      </div>

      <input
        ref={folderPickerRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        onChange={handleFolderSelection}
        style={{ display: 'none' }}
        aria-label="Seleccionar carpeta local"
      />

      {addFolderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: 760, maxWidth: '90%', boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }} role="dialog" aria-modal="true">
            <h3 style={{ marginTop: 0 }}>Agregar carpeta</h3>
            <p style={{ marginTop: 0, marginBottom: 18 }}>Ingresa el nombre de la nueva carpeta:</p>
            <input
              autoFocus
              value={folderInput}
              onChange={(event) => {
                setFolderInput(event.target.value);
                setFolderError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') createFolder(folderInput);
              }}
              placeholder="Nombre de la carpeta"
              style={{ width: '100%', padding: '8px 10px', marginBottom: 8, boxSizing: 'border-box', borderRadius: 8 }}
            />
            {folderError && <div style={{ color: 'red', marginBottom: 8 }}>{folderError}</div>}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, gap: 24 }}>
              <button onClick={closeAddFolderModal} style={{ padding: '8px 12px', borderRadius: 8 }}>Cancelar</button>
              <button onClick={() => createFolder(folderInput)} style={{ padding: '8px 12px', borderRadius: 8 }}>Crear</button>
            </div>
          </div>
        </div>
      )}

      <div className="fab-container" ref={menuRef}>
        <button className="fab-button" onClick={() => setMenuOpen((state) => !state)} aria-label="Abrir menu">
          {'\u2630'}
        </button>
        {menuOpen && (
          <ul className="fab-menu open" role="menu">
            <button className="fab-menu-item" role="menuitem" onClick={() => { setSelected(null); setMenuOpen(false); resetAndLoadImagesHome(user?.userId); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>{'\u{1F3E0}'}</span>Inicio
            </button>
            <button className="fab-menu-item" role="menuitem" onClick={() => { setPendingFolderUpload(null); setSelected('upload'); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>{'\u2795'}</span>Agregar archivos
            </button>
            <button
              className="fab-menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                folderPickerRef.current?.click();
              }}
            >
              <span aria-hidden="true" style={{ marginRight: 8 }}>{'\u{1F4C2}'}</span>Cargar carpeta
            </button>
            <button className="fab-menu-item" role="menuitem" onClick={() => { handleAddFolder(); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>{'\u{1F4C1}'}</span>Crear carpeta vacia
            </button>
            {currentFolder && (
              <button
                className="fab-menu-item"
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false);
                  if (shareState.shared) {
                    await handleUnpublishFolder();
                  } else {
                    await handlePublishFolder();
                  }
                }}
              >
                <span aria-hidden="true" style={{ marginRight: 8 }}>
                  {shareState.shared ? '\u{1F512}' : '\u{1F310}'}
                </span>
                {shareState.loading && shareState.action === 'publish'
                  ? 'Creando enlace...'
                  : shareState.loading && shareState.action === 'unpublish'
                    ? 'Despublicando...'
                    : shareState.loading
                      ? 'Procesando...'
                      : shareState.shared
                        ? 'Despublicar carpeta'
                        : 'Publicar carpeta'}
              </button>
            )}
            {currentFolder && (
              <button className="fab-menu-item" role="menuitem" onClick={openDeleteFolderModal}>
                <span aria-hidden="true" style={{ marginRight: 8 }}>{'\u{1F5D1}'}</span>Eliminar carpeta
              </button>
            )}
            {currentFolder && shareState.shared && (
              <button
                className="fab-menu-item"
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false);
                  openShareLinkModal(shareState.publicUrlPath);
                }}
              >
                <span aria-hidden="true" style={{ marginRight: 8 }}>{'\u{1F517}'}</span>Copiar enlace
              </button>
            )}
            <button className="fab-menu-item" role="menuitem" onClick={() => { if (typeof signOut === 'function') signOut(); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>{'\u{1F6AA}'}</span>Cerrar sesion
            </button>
          </ul>
        )}
      </div>

      {deleteFolderState.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} role="dialog" aria-modal="true">
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: '90%', maxWidth: 460, boxShadow: '0 6px 24px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Eliminar carpeta completa</div>
            <div style={{ marginBottom: 12 }}>
              Se eliminaran previews, originales y el acceso de esta carpeta. Esta accion no se puede deshacer.
            </div>
            {deleteFolderState.error && <div style={{ color: 'red', marginBottom: 8 }}>{deleteFolderState.error}</div>}
            {deleteFolderState.busy ? (
              <div>Eliminando carpeta completa...</div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
                <button onClick={closeDeleteFolderModal} style={{ padding: '8px 12px', borderRadius: 8 }}>Cancelar</button>
                <button onClick={handleDeleteFolder} style={{ padding: '8px 12px', borderRadius: 8, background: '#e53935', color: '#fff', border: 'none' }}>Eliminar carpeta</button>
              </div>
            )}
          </div>
        </div>
      )}

      {shareLinkModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }} role="dialog" aria-modal="true">
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: '90%', maxWidth: 560, boxShadow: '0 6px 24px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Enlace compartido</div>
            <div style={{ marginBottom: 12 }}>
              Esta es la URL publica de la carpeta:
            </div>
            <input
              readOnly
              value={shareLinkModal.url}
              onFocus={(event) => event.target.select()}
              style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', borderRadius: 8, marginBottom: 12 }}
            />
            {shareLinkModal.copied && (
              <div style={{ color: '#2e7d32', marginBottom: 12 }}>Enlace copiado al portapapeles.</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
              <button onClick={handleCopyShareLinkFromModal} style={{ padding: '8px 12px', borderRadius: 8 }}>
                Copiar
              </button>
              <button onClick={closeShareLinkModal} style={{ padding: '8px 12px', borderRadius: 8 }}>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {shareState.loading && shareState.action === 'publish' && !shareLinkModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002 }} role="dialog" aria-modal="true">
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: '90%', maxWidth: 360, boxShadow: '0 8px 30px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div
              style={{
                width: 42,
                height: 42,
                margin: '0 auto 14px',
                borderRadius: '50%',
                border: '4px solid rgba(184,137,255,0.22)',
                borderTopColor: 'var(--purple-500)',
                animation: 'spin-public-link 0.9s linear infinite',
              }}
            />
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Creando enlace publico</div>
            <div style={{ color: 'var(--muted)' }}>
              Estamos preparando la carpeta compartida. Esto puede tardar unos segundos.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainScreen;
