document.addEventListener('DOMContentLoaded', () => {
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const timeInput = document.getElementById('time-input');
    const taskList = document.getElementById('task-list');
    const taskCount = document.getElementById('task-count');
    const selectedDateInput = document.getElementById('selected-date');
    const prevDayBtn = document.getElementById('prev-day');
    const nextDayBtn = document.getElementById('next-day');
    const dayButtons = document.querySelectorAll('.day-btn');
    const manageBtn = document.getElementById('manage-btn');

    // Current selected date for viewing (defaults to today)
    let selectedDate = new Date().toISOString().split('T')[0];

    // Selected days for new task (defaults to none)
    let selectedDays = new Set();

    // Initialize date picker
    selectedDateInput.value = selectedDate;

    // Load tasks on start
    loadTasks();

    // Listen for refresh from manage window
    window.api.onRefreshTasks(() => {
        loadTasks();
    });

    // Date navigation
    prevDayBtn.addEventListener('click', () => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() - 1);
        selectedDate = date.toISOString().split('T')[0];
        selectedDateInput.value = selectedDate;
        loadTasks();
    });

    nextDayBtn.addEventListener('click', () => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + 1);
        selectedDate = date.toISOString().split('T')[0];
        selectedDateInput.value = selectedDate;
        loadTasks();
    });

    selectedDateInput.addEventListener('change', () => {
        selectedDate = selectedDateInput.value;
        loadTasks();
    });

    // Manage button
    manageBtn.addEventListener('click', () => {
        window.api.openManageWindow();
    });

    // Day selector for new tasks
    dayButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const day = btn.dataset.day;
            if (selectedDays.has(day)) {
                selectedDays.delete(day);
                btn.classList.remove('selected');
            } else {
                selectedDays.add(day);
                btn.classList.add('selected');
            }
        });
    });

    // Add task form submission
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = taskInput.value.trim();
        const taskTime = timeInput.value || null;

        if (!title) return;
        if (selectedDays.size === 0) {
            alert('Please select at least one day');
            return;
        }

        // Convert Set to sorted comma-separated string
        const days = Array.from(selectedDays).sort().join(',');

        await window.api.addTask(title, days, taskTime);

        // Reset form
        taskInput.value = '';
        timeInput.value = '';
        selectedDays.clear();
        dayButtons.forEach(btn => btn.classList.remove('selected'));
        taskInput.focus();

        loadTasks();
    });

    async function loadTasks() {
        const tasks = await window.api.getTasks(selectedDate);
        renderTasks(tasks);
    }

    function renderTasks(tasks) {
        const today = new Date().toISOString().split('T')[0];
        const isToday = selectedDate === today;
        const dateLabel = isToday ? 'today' : formatDateLabel(selectedDate);

        if (tasks.length === 0) {
            taskList.innerHTML = `
                <div class="empty-state">
                    <p>No tasks for ${dateLabel}</p>
                </div>
            `;
            taskCount.textContent = '0 tasks';
            return;
        }

        taskList.innerHTML = tasks.map(task => `
            <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <div class="checkbox ${task.completed ? 'checked' : ''}" data-action="toggle"></div>
                <div class="task-content">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        ${task.task_time ? `<span class="task-time">${formatTime(task.task_time)}</span>` : ''}
                        <span class="task-days">${formatDays(task.recurrence_value)}</span>
                    </div>
                </div>
                <button class="delete-btn" data-action="delete" title="Delete task">×</button>
            </div>
        `).join('');

        const completed = tasks.filter(t => t.completed).length;
        const total = tasks.length;
        taskCount.textContent = `${completed}/${total} completed`;
    }

    // Event delegation for task actions
    taskList.addEventListener('click', async (e) => {
        const taskItem = e.target.closest('.task-item');
        if (!taskItem) return;

        const taskId = parseInt(taskItem.dataset.id);
        const action = e.target.dataset.action;

        if (action === 'toggle') {
            await window.api.toggleTask(taskId, selectedDate);
            loadTasks();
        } else if (action === 'delete') {
            if (confirm('Delete this recurring task?')) {
                await window.api.deleteTask(taskId);
                loadTasks();
            }
        }
    });

    function formatTime(time) {
        const [hours, minutes] = time.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    }

    function formatDays(daysStr) {
        if (!daysStr) return '';
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = daysStr.split(',').map(Number);
        return days.map(d => dayNames[d]).join(', ');
    }

    function formatDateLabel(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
