document.addEventListener('DOMContentLoaded', () => {
    const taskTbody = document.getElementById('task-tbody');
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.getElementById('task-table-container');

    loadTasks();

    async function loadTasks() {
        const tasks = await window.api.getAllTasks();
        renderTasks(tasks);
    }

    function renderTasks(tasks) {
        if (tasks.length === 0) {
            tableContainer.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        tableContainer.style.display = 'block';
        emptyState.style.display = 'none';

        // Group tasks by days
        const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun
        tasks.sort((a, b) => {
            const aDays = a.recurrence_value ? a.recurrence_value.split(',').map(Number) : [];
            const bDays = b.recurrence_value ? b.recurrence_value.split(',').map(Number) : [];
            const aFirst = aDays.length > 0 ? dayOrder.indexOf(aDays[0]) : 99;
            const bFirst = bDays.length > 0 ? dayOrder.indexOf(bDays[0]) : 99;
            return aFirst - bFirst;
        });

        taskTbody.innerHTML = tasks.map(task => `
            <tr data-id="${task.id}">
                <td class="task-name">${escapeHtml(task.title)}</td>
                <td class="task-days-cell">${formatDays(task.recurrence_value)}</td>
                <td class="task-time-cell">${task.task_time ? formatTime(task.task_time) : '-'}</td>
                <td>
                    <button class="delete-btn-table" data-action="delete" title="Delete task">×</button>
                </td>
            </tr>
        `).join('');
    }

    taskTbody.addEventListener('click', async (e) => {
        if (e.target.dataset.action === 'delete') {
            const row = e.target.closest('tr');
            const taskId = parseInt(row.dataset.id);

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
        if (!daysStr) return '-';
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = daysStr.split(',').map(Number);
        return days.map(d => dayNames[d]).join(', ');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
