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

ipcMain.handle('add-task', async (event, title, recurrenceType, recurrenceValue, taskTime, resetTime) => {
    return db.addTask(title, recurrenceType, recurrenceValue, taskTime, resetTime);
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

// Calculate time that is 1 hour before a given time (HH:MM format)
function getOneHourBefore(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    let newHours = hours - 1;
    if (newHours < 0) newHours = 23;
    return `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function checkTaskNotifications() {
    if (!Notification.isSupported()) return;

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    // Get tasks with reset times for today
    const tasksWithResetTimes = db.getTasksWithResetTimesForToday();

    // Pool notifications by type and time
    const resetNowTasks = [];
    const resetSoonTasks = [];

    tasksWithResetTimes.forEach(task => {
        // Check if reset time is now
        if (task.reset_time === currentTime) {
            resetNowTasks.push(task.title);
        }
        // Check if 1 hour before reset time
        const oneHourBefore = getOneHourBefore(task.reset_time);
        if (oneHourBefore === currentTime) {
            resetSoonTasks.push(task.title);
        }
    });

    // Show pooled notification for tasks resetting now
    if (resetNowTasks.length > 0) {
        const body = resetNowTasks.length === 1
            ? `"${resetNowTasks[0]}" has reset`
            : `${resetNowTasks.length} tasks have reset:\n${resetNowTasks.map(t => `• ${t}`).join('\n')}`;

        const notification = new Notification({
            title: 'Slacker - Tasks Reset',
            body: body,
            silent: false
        });
        notification.show();
    }

    // Show pooled notification for tasks resetting in 1 hour
    if (resetSoonTasks.length > 0) {
        const body = resetSoonTasks.length === 1
            ? `"${resetSoonTasks[0]}" resets in 1 hour`
            : `${resetSoonTasks.length} tasks reset in 1 hour:\n${resetSoonTasks.map(t => `• ${t}`).join('\n')}`;

        const notification = new Notification({
            title: 'Slacker - Reset Reminder',
            body: body,
            silent: false
        });
        notification.show();
    }
}
