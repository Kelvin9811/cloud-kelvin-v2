import { prepareFolderUpload } from './folderUpload';

const makeFile = (name, relativePath) => ({
  name,
  webkitRelativePath: relativePath,
});

test('keeps only files located directly inside the selected folder', () => {
  const result = prepareFolderUpload([
    makeFile('foto.jpg', 'Vacaciones/foto.jpg'),
    makeFile('notas.txt', 'Vacaciones/notas.txt'),
    makeFile('oculta.jpg', 'Vacaciones/Album/oculta.jpg'),
    makeFile('profunda.pdf', 'Vacaciones/Documentos/2025/profunda.pdf'),
  ]);

  expect(result.folderName).toBe('Vacaciones');
  expect(result.files.map((file) => file.name)).toEqual(['foto.jpg', 'notas.txt']);
  expect(result.ignoredCount).toBe(2);
});

test('returns an empty selection when the browser provides no folder path', () => {
  const result = prepareFolderUpload([
    makeFile('archivo.txt', ''),
  ]);

  expect(result.folderName).toBe('');
  expect(result.files).toEqual([]);
  expect(result.ignoredCount).toBe(1);
});
