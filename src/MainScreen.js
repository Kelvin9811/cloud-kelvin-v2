import React, { useState, useEffect, useRef } from 'react';
import SidebarMenu from './components/SidebarMenu';
import Galery from './components/Galery';
import UploadPage from './components/UploadPage';
import './App.css';
import './components/UploadPage.css';
import carpetaLogo from './images/carpeta_logo.jpg';
import backButtonImage from './images/back-button.png';
import { uploadData, getUrl, list } from '@aws-amplify/storage';
import { getShareStatus, publishShare, unpublishShare } from './shareApi';

const FOLDER_PREFIX = 'CODIGOUNICODECARPETASKOR';
const PAGE_SIZE = 20;

const getFilenameFromPath = (path = '') => path.split('/').pop() || '';

const parseUploadDateFromFilename = (path = '') => {
  const filename = getFilenameFromPath(path);
  const match = filename.match(/^(\d{8})_(\d{6})_/);
  if (!match) return null;

  const datePart = match[1];
  const timePart = match[2];
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6)) - 1;
  const day = Number(datePart.slice(6, 8));
  const hours = Number(timePart.slice(0, 2));
  const minutes = Number(timePart.slice(2, 4));
  const seconds = Number(timePart.slice(4, 6));

  return new Date(year, month, day, hours, minutes, seconds).getTime();
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
  const menuRef = useRef();

  const [allImages, setAllImages] = useState([]);
  const [images, setImages] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const didLoadRef = useRef(false);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [addFolderModalOpen, setAddFolderModalOpen] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [folderError, setFolderError] = useState(null);
  const [shareState, setShareState] = useState({ loading: false, shared: false, shareId: null, publicUrlPath: '' });
  const [backBtnSize, setBackBtnSize] = useState(40);

  useEffect(() => {
    const computeSize = () => {
      try {
        const minSide = Math.min(window.innerWidth || 800, window.innerHeight || 600);
        const size = Math.max(32, Math.min(72, Math.round(minSide * 0.05)));
        setBackBtnSize(size);
      } catch (e) {
        setBackBtnSize(40);
      }
    };

    computeSize();
    window.addEventListener('resize', computeSize, { passive: true });
    return () => window.removeEventListener('resize', computeSize);
  }, []);

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

  const createFolder = async (folderName) => {
    const name = (folderName || '').trim();
    if (!name) {
      setFolderError('El nombre de la carpeta no puede estar vacio');
      return;
    }

    const cleanName = FOLDER_PREFIX.concat(name).replace(/\s+/g, '_');
    const userId = user?.userId;
    const previewPath = `uploads/users/${userId}/previews/${cleanName}`;
    const response = await fetch(carpetaLogo);
    const blob = await response.blob();

    await uploadData({
      path: previewPath,
      data: blob,
      options: {
        contentType: 'image/jpeg',
      }
    }).result;

    try {
      setCurrentFolder(name);
      closeAddFolderModal();
      resetAndLoadImages(user?.userId);
    } catch (err) {
      console.error('Error creando carpeta (placeholder):', err);
      setFolderError('No se pudo crear la carpeta');
    }
  };

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

  const refreshShareState = async (folderName) => {
    if (!user?.userId || !folderName) {
      setShareState({ loading: false, shared: false, shareId: null, publicUrlPath: '' });
      return;
    }

    setShareState((prev) => ({ ...prev, loading: true }));
    try {
      const status = await getShareStatus({ userId: user.userId, folderName });
      setShareState({
        loading: false,
        shared: !!status.shared,
        shareId: status.shareId || null,
        publicUrlPath: status.publicUrlPath || '',
      });
    } catch (error) {
      console.error('Error loading share status:', error);
      setShareState({ loading: false, shared: false, shareId: null, publicUrlPath: '' });
    }
  };

  const handlePublishFolder = async () => {
    if (!user?.userId || !currentFolder) return;
    setShareState((prev) => ({ ...prev, loading: true }));
    try {
      const result = await publishShare({ userId: user.userId, folderName: currentFolder });
      setShareState({
        loading: false,
        shared: true,
        shareId: result.shareId || null,
        publicUrlPath: result.publicUrlPath || '',
      });
    } catch (error) {
      console.error('Error publishing folder:', error);
      setShareState((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleUnpublishFolder = async () => {
    if (!user?.userId || !currentFolder) return;
    setShareState((prev) => ({ ...prev, loading: true }));
    try {
      await unpublishShare({ userId: user.userId, folderName: currentFolder });
      setShareState({ loading: false, shared: false, shareId: null, publicUrlPath: '' });
    } catch (error) {
      console.error('Error unpublishing folder:', error);
      setShareState((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleCopyShareLink = async () => {
    const url = getPublicShareUrl(shareState.publicUrlPath);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error('Error copying share link:', error);
    }
  };

  const handleSetFolderFromButton = (folderName) => {
    const name = (folderName || '').trim();
    if (!name) return;
    setCurrentFolder(name);
    resetAndLoadImages(user?.userId, name);
  };

  const listAllPreviewItems = async (userId, folderOverride = null) => {
    const allItems = [];
    let currentToken = undefined;

    do {
      const result = await list({
        path: getPreviewListPath(userId, folderOverride),
        options: { pageSize: 1000, nextToken: currentToken }
      });

      allItems.push(...(result.items || []));
      currentToken = result.nextToken || undefined;
    } while (currentToken);

    return allItems;
  };

  const applyLocalPagination = (sortedItems, offset = 0) => {
    const nextOffset = offset + PAGE_SIZE;
    const nextPage = sortedItems.slice(offset, nextOffset);
    setImages((prev) => offset === 0 ? nextPage : [...prev, ...nextPage]);
    setNextToken(nextOffset < sortedItems.length ? String(nextOffset) : null);
  };

  const loadMoreImages = () => {
    if (loading || !nextToken) return;
    const offset = Number(nextToken);
    if (Number.isNaN(offset)) return;
    applyLocalPagination(allImages, offset);
  };

  const loadImages = async (userId, token = null, folderOverride = null) => {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const items = await listAllPreviewItems(userId, folderOverride);
      const itemsMapped = await Promise.all(
        items.map(async (item) => ({
          properties: (await getUrl({ path: item.path })),
          path: item.path
        }))
      );

      const sortedItems = sortPreviewItems(itemsMapped);
      setAllImages(sortedItems);
      applyLocalPagination(sortedItems, 0);
    } catch (error) {
      console.log(error);
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
    if (userId) loadImages(userId, null, folderOverride);
  };

  const resetAndLoadImagesHome = (userId) => {
    setCurrentFolder(null);
    resetAndLoadImages(userId, '');
  };

  const handleDeleteLocal = (index, item) => {
    setAllImages((prev) => {
      const updated = prev.filter((entry) => entry.path !== item?.path);
      setNextToken(images.length < updated.length ? String(images.length) : null);
      return updated;
    });
    setImages((prev) => prev.filter((_, i) => i !== index));
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
      setShareState({ loading: false, shared: false, shareId: null, publicUrlPath: '' });
      return;
    }

    refreshShareState(currentFolder);
  }, [currentFolder, user]);

  useEffect(() => {
    const onScroll = () => {
      if (loading) return;
      if (!nextToken) return;
      const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 300);
      if (nearBottom) {
        loadMoreImages();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [nextToken, loading, allImages]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target)) {
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
            onClick={() => { setSelected(null); resetAndLoadImagesHome(user?.userId); }}
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
            <img src={backButtonImage} alt="Volver" style={{ height: Math.round(backBtnSize * 0.55), width: Math.round(backBtnSize * 0.55) }} />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="greeting">Hola <strong>{user?.username}</strong>{currentFolder ? ` Carpeta ${currentFolder}` : ''}</span>
        </div>

        {selected === 'upload' ? (
          <UploadPage userId={user?.userId} currentFolder={currentFolder} />
        ) : (
          <Galery images={images} onDelete={handleDeleteLocal} onSelectFolder={handleSetFolderFromButton} />
        )}
      </div>

      {addFolderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: 760, maxWidth: '90%', boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }} role="dialog" aria-modal="true">
            <h3 style={{ marginTop: 0 }}>Agregar carpeta</h3>
            <p style={{ marginTop: 0, marginBottom: 18 }}>Ingresa el nombre de la nueva carpeta:</p>
            <input
              autoFocus
              value={folderInput}
              onChange={(e) => { setFolderInput(e.target.value); setFolderError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') createFolder(folderInput); }}
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
        <button className="fab-button" onClick={() => setMenuOpen((s) => !s)} aria-label="Abrir menu">
          ☰
        </button>
        {menuOpen && (
          <ul className="fab-menu open" role="menu">
            <button className="fab-menu-item" role="menuitem" onClick={() => { setSelected(null); setMenuOpen(false); resetAndLoadImagesHome(user?.userId); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>🏠</span>Inicio
            </button>
            <button className="fab-menu-item" role="menuitem" onClick={() => { setSelected('upload'); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>➕</span>Agregar archivos
            </button>
            <button className="fab-menu-item" role="menuitem" onClick={() => { handleAddFolder(); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>📁</span>Agregar carpeta
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
                <span aria-hidden="true" style={{ marginRight: 8 }}>{shareState.shared ? '🔒' : '🌐'}</span>
                {shareState.loading ? 'Procesando...' : shareState.shared ? 'Despublicar carpeta' : 'Publicar carpeta'}
              </button>
            )}
            {currentFolder && shareState.shared && (
              <button
                className="fab-menu-item"
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false);
                  await handleCopyShareLink();
                }}
              >
                <span aria-hidden="true" style={{ marginRight: 8 }}>🔗</span>Copiar enlace
              </button>
            )}
            {currentFolder && shareState.shared && (
              <a
                className="fab-menu-item"
                role="menuitem"
                href={getPublicShareUrl(shareState.publicUrlPath)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
                style={{ textDecoration: 'none' }}
              >
                <span aria-hidden="true" style={{ marginRight: 8 }}>🔗</span>Abrir enlace publico
              </a>
            )}
            <button className="fab-menu-item" role="menuitem" onClick={() => { if (typeof signOut === 'function') signOut(); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>🚪</span>Cerrar sesion
            </button>
          </ul>
        )}
      </div>
    </div>
  );
};

export default MainScreen;
