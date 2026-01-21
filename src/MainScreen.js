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

  // nuevo estado para las imágenes cargadas
  const [images, setImages] = useState([]);

  console.log('User info:', user);

  const loadImages = async (userId) => {
    try {
      const result = await list({
        path: `uploads/users/${userId}/previews/`,
      });
      const items = result.items || [];
      console.log('Loaded items:', items);

      // esperar a que getUrl resuelva para cada item
      const itemsMapped = await Promise.all(
        items.map(async (item) => ({
          properties: (await getUrl({ path: item.path })),
          path: item.path
        }))
      );

      console.log('Mapped items with URLs:', itemsMapped);
      setImages(itemsMapped);
    } catch (error) {
      console.log(error);
    }
  };

  // cargar imágenes al montar o cuando cambie el usuario
  useEffect(() => {
    loadImages(user?.userId);
  }, [user]);

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
        <SidebarMenu onSelect={setSelected} signOut={signOut} />

        {selected === 'upload' ? (
          <UploadPage userId={user?.userId} />
        ) : (
          <Galery images={images} userId={user?.userId}/>
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
          </ul>
        )}
      </div>
    </div>
  );
};


export default MainScreen;
