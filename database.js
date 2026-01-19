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

// recurrence_type: "daily", "weekly", "monthly"
// recurrence_value: for weekly = "0,1,2" (Sun,Mon,Tue), for monthly = "15" (day of month)
function addTask(title, recurrenceType, recurrenceValue = null, taskTime = null) {
    const stmt = db.prepare(
        'INSERT INTO tasks (title, task_time, recurrence_type, recurrence_value, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run([title, taskTime, recurrenceType, recurrenceValue, new Date().toISOString()]);
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
    const completions = getCompletionsForDate(dateStr);
    const completedTaskIds = new Set(completions.map(c => c.task_id));

    // Filter tasks that apply to this date
    const tasksForDate = allTasks.filter(task => {
        if (task.recurrence_type === 'daily') {
            return true;
        }
        if (task.recurrence_type === 'weekly' && task.recurrence_value) {
            const days = task.recurrence_value.split(',').map(Number);
            return days.includes(dayOfWeek);
        }
        if (task.recurrence_type === 'monthly' && task.recurrence_value) {
            return parseInt(task.recurrence_value) === dayOfMonth;
        }
        return false;
    });

    // Add completion status
    return tasksForDate.map(task => ({
        ...task,
        completed: completedTaskIds.has(task.id)
    })).sort((a, b) => {
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
    const completions = getCompletionsForDate(dateStr);
    const isCompleted = completions.some(c => c.task_id === taskId);

    if (isCompleted) {
        db.run('DELETE FROM completions WHERE task_id = ? AND completed_date = ?', [taskId, dateStr]);
    } else {
        db.run('INSERT INTO completions (task_id, completed_date) VALUES (?, ?)', [taskId, dateStr]);
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
    const today = getTodayDate();
    const tasks = getTasksForDate(today);
    return tasks.filter(t => t.task_time && !t.completed);
}

module.exports = {
    init,
    addTask,
    getAllTasks,
    getTasksForDate,
    toggleTask,
    deleteTask,
    getTasksWithTimesForToday
};
