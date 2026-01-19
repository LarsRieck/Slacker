const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const db = require('./database');

let mainWindow;
let manageWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 450,
        height: 680,
        minWidth: 400,
        minHeight: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        titleBarStyle: 'hiddenInset',
        frame: true,
        backgroundColor: '#1a1a2e'
    });

    mainWindow.loadFile('src/index.html');
}

function createManageWindow() {
    if (manageWindow) {
        manageWindow.focus();
        return;
    }

    manageWindow = new BrowserWindow({
        width: 600,
        height: 500,
        minWidth: 400,
        minHeight: 300,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        titleBarStyle: 'hiddenInset',
        frame: true,
        backgroundColor: '#1a1a2e',
        title: 'Manage Tasks'
    });

    manageWindow.loadFile('src/manage.html');

    manageWindow.on('closed', () => {
        manageWindow = null;
        // Notify main window to reload tasks
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('refresh-tasks');
        }
    });
}

// Initialize database when app is ready
app.whenReady().then(async () => {
    await db.init();
    createWindow();
    startNotificationChecker();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers
ipcMain.handle('get-tasks', async (event, date) => {
    return db.getTasksForDate(date);
});

ipcMain.handle('get-all-tasks', async () => {
    return db.getAllTasks();
});

ipcMain.handle('add-task', async (event, title, recurrenceType, recurrenceValue, taskTime) => {
    return db.addTask(title, recurrenceType, recurrenceValue, taskTime);
});

ipcMain.handle('toggle-task', async (event, taskId, date) => {
    return db.toggleTask(taskId, date);
});

ipcMain.handle('delete-task', async (event, taskId) => {
    return db.deleteTask(taskId);
});

ipcMain.handle('open-manage-window', async () => {
    createManageWindow();
});

// Notification checker - runs every minute
function startNotificationChecker() {
    setInterval(() => {
        checkTaskNotifications();
    }, 60000);

    // Also check immediately on start
    checkTaskNotifications();
}

function checkTaskNotifications() {
    if (!Notification.isSupported()) return;

    const tasks = db.getTasksWithTimesForToday();
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    tasks.forEach(task => {
        if (task.task_time === currentTime) {
            const notification = new Notification({
                title: 'Slacker',
                body: task.title,
                silent: false
            });
            notification.show();
        }
    });
}
