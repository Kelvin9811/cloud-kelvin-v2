import React, { useState } from 'react';
import './UploadPage.css';

const UploadPage = ({ onUpload }) => {
  const [files, setFiles] = useState([]);

  const handleFiles = (e) => {
    const list = Array.from(e.target.files || []);
    setFiles(list);
  };

  // función de subida vacía por ahora; reemplazar con lógica real
  const handleUpload = async () => {
    // ...empty function for now...
    // recibir archivos en `files` y subir a tu backend/servicio de nube
    if (typeof onUpload === 'function') {
      onUpload(files);
    }
    // ejemplo: limpiar selección
    setFiles([]);
  };

  return (
    <div className="upload-page card">
      <p className="muted">Selecciona uno o varios archivos para subirlos.</p>

      <div className="upload-input-row">
        <input type="file" multiple onChange={handleFiles} />
        <button className="btn-upload" onClick={handleUpload} disabled={files.length === 0}>
          Subir
        </button>
      </div>

      {files.length > 0 && (
        <div className="upload-list">
          <h4>Archivos seleccionados:</h4>
          <ul>
            {files.map((f, i) => <li key={i}>{f.name} ({Math.round(f.size / 1024)} KB)</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default UploadPage;
