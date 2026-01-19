import React, { useState } from 'react';
import './SidebarMenu.css';

const SidebarMenu = ({ onSelect, signOut }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="hamburger" onClick={() => setOpen(!open)}>
        <span className="hamburger-label">
          {open ? 'Cerrar menú' : 'Abrir menú'}
        </span>
      </div>
      <div className={`sidebar-menu ${open ? 'open' : ''}`}>
        <div className="sidebar-menu-content">
          <ul className="sidebar-menu-list">
            <li onClick={() => { onSelect('crear'); setOpen(false); }}>Crear Historia Clínica</li>
            <li onClick={() => { onSelect('revisar'); setOpen(false); }}>Revisar Historia por cédula</li>
            <li onClick={() => { onSelect('recetas'); setOpen(false); }}>Revisar Historias</li>
          </ul>
          <button className="sidebar-logout-btn" onClick={() => { signOut(); setOpen(false); }}>
            Cerrar Sesión
          </button>
        </div>
      </div>
    </>
  );
};

export default SidebarMenu;
