import React, { useState, useEffect, useRef } from 'react';
import SidebarMenu from './components/SidebarMenu';
import Galery from './components/Galery'; // agregado
import UploadPage from './components/UploadPage'; // nuevo componente
import './App.css';
import './components/UploadPage.css'; // estilos para FAB y UploadPage
import carpetaLogo from './images/carpeta_logo.jpg';
import { uploadData, getUrl, list } from '@aws-amplify/storage';
const FOLDER_PREFIX = 'CODIGOUNICODECARPETASKOR';

const MainScreen = ({ user, signOut }) => {
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef();

  // nuevo estado para las imágenes cargadas y paginación
  const [images, setImages] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const didLoadRef = useRef(false);
  // carpeta actual (vacía por defecto). Se mostrará en el saludo cuando esté definida.
  const [currentFolder, setCurrentFolder] = useState(null);
  // Estados y métodos relacionados con carpetas
  const [addFolderModalOpen, setAddFolderModalOpen] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [folderError, setFolderError] = useState(null);

  const handleAddFolder = () => {
    // abrir modal para ingresar nombre de carpeta
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
      setFolderError('El nombre de la carpeta no puede estar vacío');
      return;
    }
    const cleanName = FOLDER_PREFIX.concat(name).replace(/\s+/g, '_');
    const userId = user?.userId;
  // crear un placeholder en el listado general de previews (visibile en la galería raiz)
  // el nombre contiene el prefijo especial para identificarlo como 'botón de carpeta'
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
  // recargar la galería ahora que cambiamos la carpeta activa
  resetAndLoadImages(user?.userId);
    } catch (err) {
      console.error('Error creando carpeta (placeholder):', err);
      setFolderError('No se pudo crear la carpeta');
    }
  };
  // Construye el path base para listar previews según la carpeta actual
  const getPreviewListPath = (userId, folderOverride = null) => {
    if (!userId) return '';
    const folder = folderOverride !== null ? folderOverride : currentFolder;
    if (folder) return `uploads/users/${userId}/${folder}/previews/`;
    return `uploads/users/${userId}/previews/`;
  };

  const handleSetFolderFromButton = (folderName) => {
    const name = (folderName || '').trim();
    if (!name) return;
    setCurrentFolder(name);
    // recargar la galería usando la nueva carpeta (pasamos override para evitar condiciones de carrera)
    resetAndLoadImages(user?.userId, name);
  };

  const loadImages = async (userId, token = null, folderOverride = null) => {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const result = await list({
        path: getPreviewListPath(userId, folderOverride),
        options: { pageSize: 20, nextToken: token ? token : undefined }
      });
      const items = result.items || [];
      const itemsMapped = await Promise.all(
        items.map(async (item) => ({
          properties: (await getUrl({ path: item.path })),
          path: item.path
        }))
      );
      console.log('List result:', itemsMapped);

      setImages((prev) => [...prev, ...itemsMapped]);
      setNextToken(result.nextToken || null);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  // Resetea el estado de la galería y fuerza una recarga desde la primera página
  const resetAndLoadImages = (userId, folderOverride = null) => {
    setImages([]);
    setNextToken(null);
    setLoading(false);
    // allow loadImages to run again
    didLoadRef.current = false;
    if (userId) loadImages(userId, null, folderOverride);
  };

  // Handler para eliminar un item localmente sin recargar toda la galería
  const handleDeleteLocal = (index, item) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // cargar imágenes al montar o cuando cambie el usuario -> resetear y cargar primera página
  useEffect(() => {

    if (didLoadRef.current) return;
    didLoadRef.current = true;

    setImages([]);
    setNextToken(null);
    setLoading(false);
    if (user?.userId) loadImages(user.userId, null);
  }, [user]);

  // cargar siguiente página al hacer scroll cerca del final
  useEffect(() => {
    const onScroll = () => {
      if (loading) return;
      if (!nextToken) return;
      const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 300);
      if (nearBottom) {
        loadImages(user?.userId, nextToken);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [nextToken, loading, user]);

  // cerrar menú si se hace clic fuera
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
      <div className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="greeting">Hola <strong>{user?.username}</strong>{currentFolder ? ` Carpeta ${currentFolder}` : ''}</span>
        </div>
        {selected === 'upload' ? (
          <UploadPage userId={user?.userId} currentFolder={currentFolder} />
        ) : (
          <Galery images={images} userId={user?.userId} onDelete={handleDeleteLocal} onSelectFolder={handleSetFolderFromButton} />
        )}
      </div>

      {/* Modal para agregar carpeta */}
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

      {/* FAB y menú desplegable */}
      <div className="fab-container" ref={menuRef}>
        <button className="fab-button" onClick={() => setMenuOpen((s) => !s)} aria-label="Abrir menú">
          ☰
        </button>
        {menuOpen && (
          <ul className="fab-menu open" role="menu">
            <button className="fab-menu-item" role="menuitem" onClick={() => { setSelected(null); setMenuOpen(false); resetAndLoadImages(user?.userId); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>🏠</span>Inicio
            </button>
            <button className="fab-menu-item" role="menuitem" onClick={() => { setSelected('upload'); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>➕</span>Agregar archivos
            </button>
            <button className="fab-menu-item" role="menuitem" onClick={() => { handleAddFolder(); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>📁</span>Agregar carpeta
            </button>
            <button className="fab-menu-item" role="menuitem" onClick={() => { if (typeof signOut === 'function') signOut(); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>🚪</span>Cerrar sesión
            </button>
          </ul>
        )}
      </div>
    </div>
  );
};


export default MainScreen;
