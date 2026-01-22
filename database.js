const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let db = null;
const DB_PATH = path.join(app.getPath('userData'), 'slacker.db');

async function init() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);

        // Check if schema is outdated (migration)
        try {
            const result = db.exec("SELECT recurrence_type FROM tasks LIMIT 1");
        } catch (e) {
            // Old schema detected, reset database
            console.log('Migrating to new schema...');
            db.run('DROP TABLE IF EXISTS tasks');
            db.run('DROP TABLE IF EXISTS completions');
        }

        // Migration: add reset_time column if missing
        try {
            db.exec("SELECT reset_time FROM tasks LIMIT 1");
        } catch (e) {
            console.log('Adding reset_time column...');
            db.run('ALTER TABLE tasks ADD COLUMN reset_time TEXT');
        }
    } else {
        db = new SQL.Database();
    }

    // Tasks table - defines recurring tasks
    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            task_time TEXT,
            recurrence_type TEXT NOT NULL,
            recurrence_value TEXT,
            reset_time TEXT,
            created_at TEXT NOT NULL
        )
    `);

    // Completions table - tracks when tasks were completed
    db.run(`
        CREATE TABLE IF NOT EXISTS completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            completed_date TEXT NOT NULL,
            UNIQUE(task_id, completed_date),
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    saveDatabase();
}

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// Calculate effective date for a task based on its reset time
// If current time is before the reset time, the task is still for "yesterday"
function getEffectiveDateForTask(resetTime) {
    const now = new Date();
    if (!resetTime) {
        return now.toISOString().split('T')[0]; // midnight reset = today
    }
    const [resetHour, resetMin] = resetTime.split(':').map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const resetMinutes = resetHour * 60 + resetMin;

    if (currentMinutes < resetMinutes) {
        // Before reset time: use yesterday
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0];
    }
    return now.toISOString().split('T')[0];
}

// recurrence_type: "daily", "weekly", "monthly"
// recurrence_value: for weekly = "0,1,2" (Sun,Mon,Tue), for monthly = "15" (day of month)
// resetTime: optional custom reset time (HH:MM), null means midnight
function addTask(title, recurrenceType, recurrenceValue = null, taskTime = null, resetTime = null) {
    const stmt = db.prepare(
        'INSERT INTO tasks (title, task_time, recurrence_type, recurrence_value, reset_time, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run([title, taskTime, recurrenceType, recurrenceValue, resetTime, new Date().toISOString()]);
    stmt.free();
    saveDatabase();

    const result = db.exec('SELECT last_insert_rowid() as id');
    return result[0].values[0][0];
}

function getAllTasks() {
    const stmt = db.prepare('SELECT * FROM tasks ORDER BY created_at ASC');
    const tasks = [];
    while (stmt.step()) {
        tasks.push(stmt.getAsObject());
    }
    stmt.free();
    return tasks;
}

function getTasksForDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayOfMonth = date.getDate();

    const allTasks = getAllTasks();

    // Check if recurrence matches for a given date
    function matchesRecurrence(task, targetDate) {
        const d = new Date(targetDate + 'T00:00:00');
        const dow = d.getDay();
        const dom = d.getDate();

        if (task.recurrence_type === 'daily') {
            return true;
        }
        if (task.recurrence_type === 'weekly' && task.recurrence_value) {
            const days = task.recurrence_value.split(',').map(Number);
            return days.includes(dow);
        }
        if (task.recurrence_type === 'monthly' && task.recurrence_value) {
            return parseInt(task.recurrence_value) === dom;
        }
        return false;
    }

    // Filter tasks that apply to this date based on recurrence
    // (reset time only affects completion tracking, not display)
    const tasksForDate = allTasks.filter(task => {
        return matchesRecurrence(task, dateStr);
    });

    // Add completion status
    // Use effective date only when viewing today, otherwise use the selected date
    const today = getTodayDate();
    return tasksForDate.map(task => {
        let completionDate;
        if (dateStr === today) {
            // Viewing today: use effective date (handles custom reset times)
            completionDate = getEffectiveDateForTask(task.reset_time);
        } else {
            // Viewing past/future: use the actual selected date
            completionDate = dateStr;
        }
        const completions = getCompletionsForDate(completionDate);
        const isCompleted = completions.some(c => c.task_id === task.id);
        return {
            ...task,
            completed: isCompleted
        };
    }).sort((a, b) => {
        // Sort: incomplete first, then by time
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.task_time && b.task_time) return a.task_time.localeCompare(b.task_time);
        if (a.task_time) return -1;
        if (b.task_time) return 1;
        return 0;
    });
}

function getCompletionsForDate(dateStr) {
    const stmt = db.prepare('SELECT * FROM completions WHERE completed_date = ?');
    stmt.bind([dateStr]);
    const completions = [];
    while (stmt.step()) {
        completions.push(stmt.getAsObject());
    }
    stmt.free();
    return completions;
}

function toggleTask(taskId, dateStr) {
    // Get task to determine its reset_time
    const stmt = db.prepare('SELECT reset_time FROM tasks WHERE id = ?');
    stmt.bind([taskId]);
    let resetTime = null;
    if (stmt.step()) {
        resetTime = stmt.getAsObject().reset_time;
    }
    stmt.free();

    // Use effective date for completion tracking
    const effectiveDate = getEffectiveDateForTask(resetTime);
    const completions = getCompletionsForDate(effectiveDate);
    const isCompleted = completions.some(c => c.task_id === taskId);

    if (isCompleted) {
        db.run('DELETE FROM completions WHERE task_id = ? AND completed_date = ?', [taskId, effectiveDate]);
    } else {
        db.run('INSERT INTO completions (task_id, completed_date) VALUES (?, ?)', [taskId, effectiveDate]);
    }
    saveDatabase();
    return !isCompleted;
}

function deleteTask(taskId) {
    db.run('DELETE FROM completions WHERE task_id = ?', [taskId]);
    db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
    saveDatabase();
}

function getTasksWithTimesForToday() {
    // Get all tasks and filter to those with reminder times that are active today
    const allTasks = getAllTasks();
    const today = getTodayDate();

    return allTasks.filter(task => {
        if (!task.task_time) return false;

        const effectiveDate = getEffectiveDateForTask(task.reset_time);
        if (effectiveDate !== today) return false;

        // Check recurrence matches today
        const date = new Date(today + 'T00:00:00');
        const dayOfWeek = date.getDay();
        const dayOfMonth = date.getDate();

        let matchesRecurrence = false;
        if (task.recurrence_type === 'daily') {
            matchesRecurrence = true;
        } else if (task.recurrence_type === 'weekly' && task.recurrence_value) {
            const days = task.recurrence_value.split(',').map(Number);
            matchesRecurrence = days.includes(dayOfWeek);
        } else if (task.recurrence_type === 'monthly' && task.recurrence_value) {
            matchesRecurrence = parseInt(task.recurrence_value) === dayOfMonth;
        }

        if (!matchesRecurrence) return false;

        // Check if not completed
        const completions = getCompletionsForDate(effectiveDate);
        const isCompleted = completions.some(c => c.task_id === task.id);
        return !isCompleted;
    });
}

// Get all tasks with reset times that are scheduled for today
function getTasksWithResetTimesForToday() {
    const allTasks = getAllTasks();
    const today = getTodayDate();
    const date = new Date(today + 'T00:00:00');
    const dayOfWeek = date.getDay();
    const dayOfMonth = date.getDate();

    return allTasks.filter(task => {
        if (!task.reset_time) return false;

        // Check recurrence matches today
        let matchesRecurrence = false;
        if (task.recurrence_type === 'daily') {
            matchesRecurrence = true;
        } else if (task.recurrence_type === 'weekly' && task.recurrence_value) {
            const days = task.recurrence_value.split(',').map(Number);
            matchesRecurrence = days.includes(dayOfWeek);
        } else if (task.recurrence_type === 'monthly' && task.recurrence_value) {
            matchesRecurrence = parseInt(task.recurrence_value) === dayOfMonth;
        }

        return matchesRecurrence;
    });
}

module.exports = {
    init,
    addTask,
    getAllTasks,
    getTasksForDate,
    toggleTask,
    deleteTask,
    getTasksWithTimesForToday,
    getTasksWithResetTimesForToday
};
