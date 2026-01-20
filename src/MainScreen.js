import React, { useState, useEffect, useRef } from 'react';
import SidebarMenu from './components/SidebarMenu';
import Galery from './components/Galery'; // agregado
import UploadPage from './components/UploadPage'; // nuevo componente
import './App.css';
import './components/UploadPage.css'; // estilos para FAB y UploadPage

const MainScreen = ({ user, signOut }) => {
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef();

  console.log('User info:', user);

  // imágenes de ejemplo; sustituir por las URLs de tu nube o por prop/fetch
  const sampleImages = [
    { src: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=1200&q=60&auto=format&fit=crop', title: 'Paisaje 1' },
    { src: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=1200&q=60&auto=format&fit=crop', title: 'Retrato 2' },
    { src: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=1200&q=60&auto=format&fit=crop', title: 'Ciudad 3' },
    // ...existing code...
  ];

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
          <Galery images={sampleImages} />
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
                <span aria-hidden="true" style={{marginRight:8}}>🏠</span>Inicio
              </button>
              <button className="fab-menu-item" role="menuitem" onClick={() => { setSelected('upload'); setMenuOpen(false); }}>
                <span aria-hidden="true" style={{marginRight:8}}>➕</span>Agregar archivos
              </button>
            </ul>
        )}
      </div>
    </div>
  );
};


export default MainScreen;
