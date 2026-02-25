const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getTasks: (date) => ipcRenderer.invoke('get-tasks', date),
    getAllTasks: () => ipcRenderer.invoke('get-all-tasks'),
    addTask: (title, recurrenceType, recurrenceValue, taskTime, resetTime) => ipcRenderer.invoke('add-task', title, recurrenceType, recurrenceValue, taskTime, resetTime),
    toggleTask: (taskId, date) => ipcRenderer.invoke('toggle-task', taskId, date),
    deleteTask: (taskId) => ipcRenderer.invoke('delete-task', taskId),
    openManageWindow: () => ipcRenderer.invoke('open-manage-window'),
    onRefreshTasks: (callback) => ipcRenderer.on('refresh-tasks', callback)
});
