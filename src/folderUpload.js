export const prepareFolderUpload = (fileList) => {
  const selectedFiles = Array.from(fileList || []);
  const firstRelativePath = selectedFiles
    .map((file) => file.webkitRelativePath || '')
    .find(Boolean);
  const folderName = (firstRelativePath?.split('/')[0] || '').trim();

  if (!folderName) {
    return {
      folderName: '',
      files: [],
      ignoredCount: selectedFiles.length,
    };
  }

  const files = selectedFiles.filter((file) => {
    const relativePath = file.webkitRelativePath || '';
    const pathParts = relativePath.split('/').filter(Boolean);
    return pathParts.length === 2 && pathParts[0] === folderName;
  });

  return {
    folderName,
    files,
    ignoredCount: selectedFiles.length - files.length,
  };
};
