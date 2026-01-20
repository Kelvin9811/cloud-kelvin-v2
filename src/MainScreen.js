import React, { useState } from 'react';
import SidebarMenu from './components/SidebarMenu';
import Galery from './components/Galery'; // agregado

const MainScreen = ({ user, signOut }) => {
  const [selected, setSelected] = useState(null);
  console.log('User info:', user);

  // imágenes de ejemplo; sustituir por las URLs de tu nube o por prop/fetch
  const sampleImages = [
    { src: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=1200&q=60&auto=format&fit=crop', title: 'Paisaje 1' },
    { src: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=1200&q=60&auto=format&fit=crop', title: 'Retrato 2' },
    { src: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=1200&q=60&auto=format&fit=crop', title: 'Ciudad 3' },
    // ...existing code...
  ];

  return (
    <div className="App">
      <SidebarMenu onSelect={setSelected} signOut={signOut} />
      <div className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 24 }}>
          <span>Hola <strong>{user?.username}</strong></span>
        </div>
        
        {!selected && (
          <div className="card">
            <h2>Bienvenido al Control de Historias Clínicas</h2>
            <p>Seleccione una opción en el menú.</p>
          </div>
        )}

          <Galery images={sampleImages} />
      </div>
    </div>
  );
};


export default MainScreen;
