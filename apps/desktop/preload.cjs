const { contextBridge, ipcRenderer } = require('electron');

// The engine authenticates with HTTP Basic. The password is minted per start by the launcher and
// arrives on argv rather than in process.env, because a sandboxed preload (webPreferences.sandbox =
// true) does not get a full process object.
//
// Returns undefined when there is no desktop shell (plain browser), which is the right answer
// there: with no shell there is no password, so the engine rejects the request.
function credentials() {
  const arg = (prefix) => {
    const hit = process.argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
  };
  const user = arg('--arunaki-server-user=');
  const password = arg('--arunaki-server-password=');
  if (!user || !password) return undefined;
  return { user, password, engineUrl: arg('--arunaki-engine-url=') || 'http://127.0.0.1:4096' };
}

contextBridge.exposeInMainWorld('arunakiDesktop', {
  credentials,
  ping: () => ipcRenderer.invoke('app:ping').catch(() => 'desktop'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  getFolderTree: (folderPath) => ipcRenderer.invoke('fs:getFolderTree', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  createFolder: (folderPath) => ipcRenderer.invoke('fs:createFolder', folderPath),
  backupFolder: () => ipcRenderer.invoke('fs:backupFolder'),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:deletePath', targetPath),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('fs:renamePath', oldPath, newPath),
  openPath: (targetPath) => ipcRenderer.invoke('app:openPath', targetPath),
  openExcelNative: (filePath) => ipcRenderer.invoke('excel:openNative', filePath),
  openWordNative: (filePath) => ipcRenderer.invoke('word:openNative', filePath),
  parseExcel: (filePath) => ipcRenderer.invoke('fs:parseExcel', filePath),
  writeExcel: (filePath, rows) => ipcRenderer.invoke('fs:writeExcel', filePath, rows),
  readBinaryFile: (filePath) => ipcRenderer.invoke('fs:readBinaryFile', filePath),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  notify: (payload) => ipcRenderer.invoke('app:notify', payload),
  getSystemInfo: () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${process.platform === 'win32' ? 'Windows_NT' : process.platform} ${process.arch} 10.0.26200`,
  }),
});
