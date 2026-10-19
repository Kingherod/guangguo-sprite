'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  config: () => ipcRenderer.invoke('pet:config'),
  ready: report => ipcRenderer.send('pet:ready',report),
  fatal: message => ipcRenderer.send('pet:fatal',String(message)),
  status: status => ipcRenderer.send('pet:status',status),
  activity: callback => ipcRenderer.on('pet:activity', (_event,state) => callback(state)),
  motion: callback => ipcRenderer.on('pet:motion', (_event,motion) => callback(motion)),
  reload: callback => ipcRenderer.on('pet:reload', () => callback()),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragMove: delta => ipcRenderer.send('pet:drag-move',delta),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  menu: () => ipcRenderer.send('pet:menu'),
  saveTest: result => ipcRenderer.invoke('pet:selftest',result)
});
