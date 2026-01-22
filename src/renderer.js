document.addEventListener('DOMContentLoaded', () => {
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const customResetCheck = document.getElementById('custom-reset-check');
    const resetTimeInput = document.getElementById('reset-time-input');
    const taskList = document.getElementById('task-list');
    const taskCount = document.getElementById('task-count');
    const selectedDateInput = document.getElementById('selected-date');
    const prevDayBtn = document.getElementById('prev-day');
    const nextDayBtn = document.getElementById('next-day');
    const dayButtons = document.querySelectorAll('.day-btn');
    const manageBtn = document.getElementById('manage-btn');
    const sortSelect = document.getElementById('sort-select');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmYes = document.getElementById('confirm-yes');
    const confirmNo = document.getElementById('confirm-no');
    const autocompleteList = document.getElementById('autocomplete-list');

    // Autocomplete state
    let allTaskTitles = [];
    let selectedAutocompleteIndex = -1;

    // Custom confirm dialog that doesn't break focus
    function showConfirm(message) {
        return new Promise((resolve) => {
            confirmMessage.textContent = message;
            confirmModal.classList.remove('hidden');

            const handleYes = () => {
                cleanup();
                resolve(true);
            };
            const handleNo = () => {
                cleanup();
                resolve(false);
            };
            const cleanup = () => {
                confirmYes.removeEventListener('click', handleYes);
                confirmNo.removeEventListener('click', handleNo);
                confirmModal.classList.add('hidden');
            };

            confirmYes.addEventListener('click', handleYes);
            confirmNo.addEventListener('click', handleNo);
        });
    }

    // Current selected date for viewing (defaults to today)
    let selectedDate = new Date().toISOString().split('T')[0];

    // Selected days for new task (defaults to none)
    let selectedDays = new Set();

    // Current sort mode
    let sortMode = localStorage.getItem('sortMode') || 'default';

    // Initialize date picker
    selectedDateInput.value = selectedDate;

    // Initialize sort selector
    sortSelect.value = sortMode;
    sortSelect.addEventListener('change', () => {
        sortMode = sortSelect.value;
        localStorage.setItem('sortMode', sortMode);
        loadTasks();
    });

    // Load tasks on start
    loadTasks();
    loadTaskTitles();

    // Auto-refresh every 10 seconds to catch reset time changes
    setInterval(() => {
        loadTasks();
    }, 10000);

    // Load all task titles for autocomplete
    async function loadTaskTitles() {
        const tasks = await window.api.getAllTasks();
        // Get unique titles
        allTaskTitles = [...new Set(tasks.map(t => t.title))];
    }

    // Autocomplete input handler
    taskInput.addEventListener('input', () => {
        const value = taskInput.value.trim().toLowerCase();
        if (value.length === 0) {
            hideAutocomplete();
            return;
        }

        const matches = allTaskTitles.filter(title =>
            title.toLowerCase().includes(value) && title.toLowerCase() !== value
        );

        if (matches.length === 0) {
            hideAutocomplete();
            return;
        }

        showAutocomplete(matches);
    });

    // Keyboard navigation for autocomplete
    taskInput.addEventListener('keydown', (e) => {
        const items = autocompleteList.querySelectorAll('.autocomplete-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
            updateAutocompleteSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, 0);
            updateAutocompleteSelection(items);
        } else if (e.key === 'Enter' && selectedAutocompleteIndex >= 0) {
            e.preventDefault();
            selectAutocompleteItem(items[selectedAutocompleteIndex].textContent);
        } else if (e.key === 'Escape') {
            hideAutocomplete();
        }
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            hideAutocomplete();
        }
    });

    function showAutocomplete(matches) {
        selectedAutocompleteIndex = -1;
        autocompleteList.innerHTML = matches.slice(0, 5).map(title =>
            `<div class="autocomplete-item">${escapeHtml(title)}</div>`
        ).join('');
        autocompleteList.classList.remove('hidden');

        // Add click handlers
        autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                selectAutocompleteItem(item.textContent);
            });
        });
    }

    function hideAutocomplete() {
        autocompleteList.classList.add('hidden');
        selectedAutocompleteIndex = -1;
    }

    function updateAutocompleteSelection(items) {
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === selectedAutocompleteIndex);
        });
    }

    function selectAutocompleteItem(title) {
        taskInput.value = title;
        hideAutocomplete();
        taskInput.focus();
    }

    // Listen for refresh from manage window
    window.api.onRefreshTasks(() => {
        loadTasks();
        loadTaskTitles();
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

    // Custom reset time checkbox
    customResetCheck.addEventListener('change', () => {
        if (customResetCheck.checked) {
            resetTimeInput.classList.remove('hidden');
        } else {
            resetTimeInput.classList.add('hidden');
            resetTimeInput.value = '';
        }
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
        hideAutocomplete();

        const title = taskInput.value.trim();
        const resetTime = customResetCheck.checked && resetTimeInput.value ? resetTimeInput.value : null;

        if (!title) return;
        if (selectedDays.size === 0) {
            // Highlight day selector to indicate selection needed
            const daySelector = document.querySelector('.day-selector');
            daySelector.classList.add('shake');
            setTimeout(() => daySelector.classList.remove('shake'), 500);
            return;
        }

        // Convert Set to sorted comma-separated string
        const days = Array.from(selectedDays).sort().join(',');

        await window.api.addTask(title, days, null, resetTime);

        // Reset form
        taskInput.value = '';
        customResetCheck.checked = true;
        resetTimeInput.classList.remove('hidden');
        resetTimeInput.value = '';
        selectedDays.clear();
        dayButtons.forEach(btn => btn.classList.remove('selected'));
        taskInput.focus();

        loadTasks();
        loadTaskTitles(); // Refresh autocomplete list
    });

    async function loadTasks() {
        const tasks = await window.api.getTasks(selectedDate);
        renderTasks(tasks);
    }

    function sortTasks(tasks) {
        const sorted = [...tasks];
        switch (sortMode) {
            case 'alphabetical':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'reset-time':
                sorted.sort((a, b) => {
                    // Tasks with reset time first, sorted by time
                    if (a.reset_time && b.reset_time) return a.reset_time.localeCompare(b.reset_time);
                    if (a.reset_time) return -1;
                    if (b.reset_time) return 1;
                    return 0;
                });
                break;
            case 'default':
            default:
                // Incomplete first, then by reset time
                sorted.sort((a, b) => {
                    if (a.completed !== b.completed) return a.completed ? 1 : -1;
                    if (a.reset_time && b.reset_time) return a.reset_time.localeCompare(b.reset_time);
                    if (a.reset_time) return -1;
                    if (b.reset_time) return 1;
                    return 0;
                });
                break;
        }
        return sorted;
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

        const sortedTasks = sortTasks(tasks);
        taskList.innerHTML = sortedTasks.map(task => `
            <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <div class="checkbox ${task.completed ? 'checked' : ''}" data-action="toggle"></div>
                <div class="task-content">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        ${task.task_time ? `<span class="task-time">${formatTime(task.task_time)}</span>` : ''}
                        <span class="task-days">${formatDays(task.recurrence_value)}</span>
                        ${task.reset_time ? `<span class="task-reset">Resets ${formatTime(task.reset_time)}</span>` : ''}
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
            const confirmed = await showConfirm('Delete this recurring task?');
            if (confirmed) {
                await window.api.deleteTask(taskId);
                loadTasks();
                loadTaskTitles();
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
