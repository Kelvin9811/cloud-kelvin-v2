import React, { useState } from 'react';
import SidebarMenu from './components/SidebarMenu';

const MainScreen = ({ user, signOut }) => {
  const [selected, setSelected] = useState(null);
  console.log('User info:', user);
  return (
    <div>
      <SidebarMenu onSelect={setSelected} signOut={signOut} />
      <div style={{ }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 24 }}>
          <span>Hola <strong>{user?.username}</strong></span>
        </div>
        
        {!selected && (
          <div>
            <h2>Bienvenido al Control de Historias Clínicas</h2>
            <p>Seleccione una opción en el menú.</p>
          </div>
        )}
      </div>
    </div>
  );
};


export default MainScreen;
