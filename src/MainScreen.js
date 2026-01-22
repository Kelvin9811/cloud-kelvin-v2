import React, { useState, useEffect, useRef } from 'react';
import SidebarMenu from './components/SidebarMenu';
import Galery from './components/Galery'; // agregado
import UploadPage from './components/UploadPage'; // nuevo componente
import './App.css';
import './components/UploadPage.css'; // estilos para FAB y UploadPage
import { uploadData, getUrl, list } from '@aws-amplify/storage';

const MainScreen = ({ user, signOut }) => {
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef();

  // nuevo estado para las imágenes cargadas y paginación
  const [images, setImages] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const didLoadRef = useRef(false);

  const loadImages = async (userId, token = null) => {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const result = await list({
        path: `uploads/users/${userId}/previews/`,
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
          <span className="greeting">Hola <strong>{user?.username}</strong></span>
        </div>
        {selected === 'upload' ? (
          <UploadPage userId={user?.userId} />
        ) : (
          <Galery images={images} userId={user?.userId} />
        )}
      </div>

      {/* FAB y menú desplegable */}
      <div className="fab-container" ref={menuRef}>
        <button className="fab-button" onClick={() => setMenuOpen((s) => !s)} aria-label="Abrir menú">
          ☰
        </button>
        {menuOpen && (
          <ul className="fab-menu open" role="menu">
            <button className="fab-menu-item" role="menuitem" onClick={() => { setSelected(null); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>🏠</span>Inicio
            </button>
            <button className="fab-menu-item" role="menuitem" onClick={() => { setSelected('upload'); setMenuOpen(false); }}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>➕</span>Agregar archivos
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
