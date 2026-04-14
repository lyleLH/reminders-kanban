import { invoke } from '@tauri-apps/api/core';
import { TwemojiPicker } from './emoji-picker.js';

let tasks = [];
let lists = [];
let currentList = null;
let pollTimer = null;
let dragState = null;

const STATUSES = ['待办', '进行中', '已完成'];

// ── 设置 ─────────────────────────────────────────
const settings = {
    scale: parseInt(localStorage.getItem('ui-scale') || '100'),
    pollInterval: parseInt(localStorage.getItem('poll-interval') || '3000'),
    completedDays: parseInt(localStorage.getItem('completed-days') || '30'),
    hiddenLists: JSON.parse(localStorage.getItem('hidden-lists') || '[]'),
    theme: localStorage.getItem('ui-theme') || 'shadcn',
};

function saveSetting(key, value) {
    settings[key] = value;
    const storageKeys = { scale: 'ui-scale', pollInterval: 'poll-interval', completedDays: 'completed-days' };
    localStorage.setItem(storageKeys[key], value.toString());
}

function applyScale() {
    document.documentElement.style.zoom = (settings.scale / 100).toString();
    const el = document.getElementById('scale-value');
    if (el) el.textContent = settings.scale + '%';
}

let settingsOpen = false;

function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.querySelectorAll('.theme-opt').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });
}

function initSettings() {
    applyScale();
    applyTheme();

    // 视图切换
    document.getElementById('settings-toggle')?.addEventListener('click', () => {
        settingsOpen = !settingsOpen;
        document.getElementById('kanban-view').style.display = settingsOpen ? 'none' : '';
        document.getElementById('settings-view').style.display = settingsOpen ? '' : 'none';
        document.getElementById('settings-toggle').classList.toggle('active', settingsOpen);
    });

    // 主题切换
    document.querySelectorAll('.theme-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            settings.theme = btn.dataset.theme;
            localStorage.setItem('ui-theme', settings.theme);
            applyTheme();
        });
    });

    // 缩放按钮
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.action === 'increase') settings.scale = Math.min(150, settings.scale + 10);
            else settings.scale = Math.max(70, settings.scale - 10);
            saveSetting('scale', settings.scale);
            applyScale();
        });
    });

    // 轮询间隔
    const pollSelect = document.getElementById('poll-interval');
    if (pollSelect) {
        pollSelect.value = settings.pollInterval.toString();
        pollSelect.addEventListener('change', () => {
            saveSetting('pollInterval', parseInt(pollSelect.value));
            startPolling(); // 重启轮询
        });
    }

    // 已完成天数
    const daysSelect = document.getElementById('completed-days');
    if (daysSelect) {
        daysSelect.value = settings.completedDays.toString();
        daysSelect.addEventListener('change', () => {
            saveSetting('completedDays', parseInt(daysSelect.value));
            fetchReminders(); // 刷新
        });
    }
}

let listPicker = null;
let listPickerClosedAt = 0;

// 从列表名拆分开头的 emoji 和纯名字
// "🤣 Moe Card" → { emoji: "🤣", name: "Moe Card" }
// "Moe Card" → { emoji: null, name: "Moe Card" }
function splitListName(fullName) {
    const seg = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(fullName)];
    if (seg.length === 0) return { emoji: null, name: fullName };
    const first = seg[0].segment;
    // 检测第一个 grapheme 是否是 emoji（含修饰符、ZWJ 序列等）
    const emojiRe = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u;
    if (emojiRe.test(first)) {
        const rest = fullName.slice(first.length).replace(/^ /, '');
        return { emoji: first, name: rest };
    }
    return { emoji: null, name: fullName };
}

// ── 子任务解析（notes 里 `- [ ]` / `- [x]` 格式）──
function parseSubtasks(notes) {
    if (!notes) return { subtasks: [], rest: '' };
    const lines = notes.split('\n');
    const subtasks = [];
    const rest = [];
    for (const line of lines) {
        const m = line.match(/^- \[([ x])\] (.+)$/);
        if (m) subtasks.push({ done: m[1] === 'x', text: m[2] });
        else rest.push(line);
    }
    return { subtasks, rest: rest.join('\n').trim() };
}

function serializeSubtasks(subtasks, rest) {
    const lines = subtasks.map(s => `- [${s.done ? 'x' : ' '}] ${s.text}`);
    return rest ? lines.join('\n') + '\n' + rest : lines.join('\n');
}

// ── 启动 ─────────────────────────────────────────
async function init() {
    initSettings();
    await loadLists();
    startPolling();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Cmd+= 放大, Cmd+- 缩小, Cmd+0 重置
    document.addEventListener('keydown', e => {
        if (e.metaKey && (e.key === '=' || e.key === '+')) {
            e.preventDefault();
            settings.scale = Math.min(150, settings.scale + 10);
            saveSetting('scale', settings.scale);
            applyScale();
        } else if (e.metaKey && e.key === '-') {
            e.preventDefault();
            settings.scale = Math.max(70, settings.scale - 10);
            saveSetting('scale', settings.scale);
            applyScale();
        } else if (e.metaKey && e.key === '0') {
            e.preventDefault();
            settings.scale = 100;
            saveSetting('scale', settings.scale);
            applyScale();
        }
    });
}

let allLists = []; // 所有列表（含隐藏的，给设置页用）

async function loadLists() {
    try {
        allLists = await invoke('get_lists');
        lists = allLists.filter(l => !settings.hiddenLists.includes(l.name));
        renderListSelector();
        renderListToggles();
        if (!currentList && lists.length > 0) {
            selectList(lists[0].name);
        } else if (currentList && settings.hiddenLists.includes(currentList)) {
            currentList = null;
            if (lists.length > 0) selectList(lists[0].name);
        }
    } catch (e) {
        setStatus('<i class="ph ph-warning-circle"></i> 获取列表失败: ' + e, 'red');
    }
}

function renderListToggles() {
    const container = document.getElementById('list-toggles');
    if (!container) return;
    container.innerHTML = '';
    allLists.forEach(l => {
        const visible = !settings.hiddenLists.includes(l.name);
        const item = document.createElement('div');
        item.className = 'settings-item list-toggle-item';
        const { emoji: le, name: ln } = splitListName(l.name);
        const dot = le || (l.color ? `<span style="width:8px;height:8px;border-radius:50%;background:${l.color};display:inline-block"></span>` : '');
        item.innerHTML = `
            <div class="settings-item-label"><span>${dot} ${ln}</span></div>
            <button class="list-delete-btn" title="删除列表"><i class="ph ph-trash"></i></button>
            <label class="toggle">
                <input type="checkbox" ${visible ? 'checked' : ''} />
                <span class="toggle-slider"></span>
            </label>
        `;
        // 删除列表（两次点击确认）
        const delBtn = item.querySelector('.list-delete-btn');
        let delConfirm = false;
        delBtn.addEventListener('click', async () => {
            if (!delConfirm) {
                delConfirm = true;
                delBtn.innerHTML = '<i class="ph ph-trash"></i> 确认?';
                delBtn.classList.add('confirm');
                setTimeout(() => { delConfirm = false; delBtn.innerHTML = '<i class="ph ph-trash"></i>'; delBtn.classList.remove('confirm'); }, 3000);
                return;
            }
            try {
                await invoke('delete_list', { name: l.name });
                settings.hiddenLists = settings.hiddenLists.filter(n => n !== l.name);
                localStorage.setItem('hidden-lists', JSON.stringify(settings.hiddenLists));
                if (currentList === l.name) { currentList = null; }
                await loadLists();
                if (!currentList && lists.length > 0) selectList(lists[0].name);
            } catch (e) { console.error('删除列表失败:', e); }
        });
        item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                settings.hiddenLists = settings.hiddenLists.filter(n => n !== l.name);
            } else {
                settings.hiddenLists.push(l.name);
            }
            localStorage.setItem('hidden-lists', JSON.stringify(settings.hiddenLists));
            lists = allLists.filter(li => !settings.hiddenLists.includes(li.name));
            renderListSelector();
            if (currentList && settings.hiddenLists.includes(currentList)) {
                currentList = null;
                if (lists.length > 0) selectList(lists[0].name);
            }
        });
        container.appendChild(item);
    });
}

function selectList(name) {
    currentList = name;
    document.querySelectorAll('.project-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.list === name);
    });
    fetchReminders();
}

// ── 数据 ─────────────────────────────────────────
async function fetchReminders() {
    if (!currentList || dragState) return;
    try {
        tasks = await invoke('get_reminders', { list: currentList });
        render();
        setStatus('', '');
    } catch (e) {
        setStatus('<i class="ph ph-warning-circle"></i> ' + e, 'red');
    }
}

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchReminders, settings.pollInterval);
}

// ── 拖拽 ─────────────────────────────────────────
function onMouseDown(e, taskId) {
    if (e.button !== 0) return;
    dragState = {
        id: taskId, el: e.currentTarget,
        startX: e.clientX, startY: e.clientY,
        ghostEl: null, started: false,
    };
    e.preventDefault();
}

function onMouseMove(e) {
    if (!dragState) return;
    if (!dragState.started) {
        if (Math.abs(e.clientX - dragState.startX) + Math.abs(e.clientY - dragState.startY) < 5) return;
        dragState.started = true;
        const ghost = dragState.el.cloneNode(true);
        ghost.className = 'card ghost';
        ghost.style.cssText = `position:fixed;width:${dragState.el.offsetWidth}px;pointer-events:none;z-index:1000;`;
        document.body.appendChild(ghost);
        dragState.ghostEl = ghost;
        dragState.el.classList.add('dragging');
    }
    if (dragState.ghostEl) {
        dragState.ghostEl.style.left = (e.clientX - 20) + 'px';
        dragState.ghostEl.style.top = (e.clientY - 15) + 'px';
    }
    // 检测 drop 到卡片上（子任务）还是列上（改状态）
    let hoveredCard = null;
    document.querySelectorAll('.card').forEach(card => {
        if (card === dragState.el || card.classList.contains('ghost')) return;
        const r = card.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        card.classList.toggle('drop-target', inside);
        if (inside) hoveredCard = card;
    });

    document.querySelectorAll('.col').forEach(col => {
        const r = col.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        col.classList.toggle('drag-over', inside && !hoveredCard);
    });
}

function onMouseUp(e) {
    if (!dragState || !dragState.started) { dragState = null; return; }

    // 检查是否 drop 到了另一张卡片上（变成子任务）
    const targetCard = document.querySelector('.card.drop-target');
    if (targetCard && targetCard.dataset.id !== dragState.id) {
        makeSubtask(dragState.id, targetCard.dataset.id);
    } else {
        // 否则检查 drop 到列上（改状态）
        const targetCol = document.querySelector('.col.drag-over');
        if (targetCol) changeStatus(dragState.id, targetCol.dataset.status);
    }

    if (dragState.ghostEl) dragState.ghostEl.remove();
    if (dragState.el) dragState.el.classList.remove('dragging');
    document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
    document.querySelectorAll('.card.drop-target').forEach(c => c.classList.remove('drop-target'));
    dragState = null;
}

async function changeStatus(id, newStatus) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const oldStatus = task.status;
    task.status = newStatus;
    render();
    try {
        await invoke('set_status', { id, status: newStatus });
        await fetchReminders();
    } catch (e) {
        task.status = oldStatus;
        render();
        setStatus('<i class="ph ph-warning-circle"></i> 移动失败: ' + e, 'red');
    }
}

// ── 子任务化（拖到卡片上）─────────────────────────
async function makeSubtask(sourceId, targetId) {
    const source = tasks.find(t => t.id === sourceId);
    const target = tasks.find(t => t.id === targetId);
    if (!source || !target) return;

    // 把 source 的标题加到 target 的 notes 里作为子任务
    const { subtasks, rest } = parseSubtasks(target.notes);
    subtasks.push({ done: false, text: source.title });
    const newNotes = serializeSubtasks(subtasks, rest);

    try {
        await invoke('update_field', { id: targetId, field: 'notes', value: newNotes });
        // 完成原任务（从看板消失）
        await invoke('complete_reminder', { id: sourceId });
        await fetchReminders();
    } catch (e) {
        setStatus('<i class="ph ph-warning-circle"></i> 操作失败: ' + e, 'red');
    }
}

// ── 新增 ─────────────────────────────────────────
async function addTask(title) {
    if (!title.trim() || !currentList) return;
    try {
        await invoke('add_reminder', { list: currentList, title: title.trim() });
        tasks = await invoke('get_reminders', { list: currentList });
        render(true);
        // 重新聚焦新增输入框
        const newInput = document.querySelector('.add-input');
        if (newInput) newInput.focus();
    } catch (e) {
        setStatus('<i class="ph ph-warning-circle"></i> 新增失败: ' + e, 'red');
    }
}

// ── 详情 ─────────────────────────────────────────
function showDetail(task) {
    const old = document.getElementById('detail-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'detail-overlay';
    overlay.innerHTML = `
        <div class="detail-panel">
            <div class="detail-header">
                <button class="emoji-toggle" id="emoji-btn">${task.emoji || '<i class="ph ph-smiley-sticker"></i>'}</button>
                <input class="detail-title" value="${task.title.replace(/"/g, '&quot;')}" />
                <button class="detail-close"><i class="ph ph-x"></i></button>
            </div>
            <div class="detail-body">
                <div class="detail-meta"><i class="ph ph-folder-simple"></i> ${splitListName(task.list).name} &middot; ${task.status}</div>
                <div>
                    <div class="detail-label">子任务</div>
                    <div class="subtasks" id="subtask-list"></div>
                    <div class="subtask-add">
                        <input class="subtask-input" placeholder="添加子任务，回车确认" />
                    </div>
                </div>
                <div>
                    <div class="detail-label">优先级</div>
                    <div class="priority-group" id="detail-priority">
                        <button class="priority-btn ${(!task.priorityValue || task.priorityValue === 0) ? 'active' : ''}" data-value="0">无</button>
                        <button class="priority-btn pri-low ${task.priorityValue === 9 ? 'active' : ''}" data-value="9"><span class="priority-dot dot-blue"></span> 低</button>
                        <button class="priority-btn pri-medium ${task.priorityValue === 5 ? 'active' : ''}" data-value="5"><span class="priority-dot dot-orange"></span> 中</button>
                        <button class="priority-btn pri-high ${task.priorityValue === 1 ? 'active' : ''}" data-value="1"><span class="priority-dot dot-red"></span> 高</button>
                    </div>
                </div>
                <div>
                    <div class="detail-label">链接</div>
                    <div class="url-row">
                        <i class="ph ph-link"></i>
                        <input class="detail-url" value="${task.url || ''}" placeholder="添加 URL..." />
                        ${task.url ? `<a class="url-open" href="${task.url}" target="_blank"><i class="ph ph-arrow-square-out"></i></a>` : ''}
                    </div>
                </div>
                <div>
                    <div class="detail-label">描述</div>
                    <textarea class="detail-notes" placeholder="添加任务描述...">${task.notes || ''}</textarea>
                </div>
            </div>
            <div class="detail-footer">
                <button class="detail-btn complete-btn"><i class="ph ph-check-circle"></i> 标记完成</button>
                <button class="detail-btn delete-btn"><i class="ph ph-trash"></i> 删除</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    parseTwemoji(overlay);

    // ── Emoji picker ──
    let selectedEmoji = task.emoji || null;
    const emojiBtn = overlay.querySelector('#emoji-btn');
    let picker = null;
    emojiBtn.addEventListener('click', () => {
        if (picker) { picker.close(); picker = null; return; }
        const body = overlay.querySelector('.detail-body');
        const footer = overlay.querySelector('.detail-footer');
        // 收起 body 和 footer 给 picker 腾空间
        body.style.display = 'none';
        footer.style.display = 'none';
        picker = new TwemojiPicker({
            anchor: emojiBtn,
            onSelect: (emoji) => {
                selectedEmoji = emoji;
                emojiBtn.textContent = emoji;
                parseTwemoji(emojiBtn);
            },
            onClose: () => {
                picker = null;
                body.style.display = '';
                footer.style.display = '';
            },
        });
        picker.open();
    });

    // 优先级按钮组
    overlay.querySelectorAll('.priority-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    const { subtasks, rest } = parseSubtasks(task.notes);
    const subtaskList = overlay.querySelector('#subtask-list');
    const notesArea = overlay.querySelector('.detail-notes');
    // notes 区只显示非子任务部分
    notesArea.value = rest;

    function renderSubtasks() {
        subtaskList.innerHTML = '';
        subtasks.forEach((s, i) => {
            const row = document.createElement('label');
            row.className = 'subtask-row' + (s.done ? ' done' : '');
            row.innerHTML = `<input type="checkbox" ${s.done ? 'checked' : ''} /><span class="subtask-text">${s.text}</span><button class="subtask-detach" title="拆为独立任务"><i class="ph ph-arrow-square-out"></i></button>`;
            row.querySelector('input[type="checkbox"]').addEventListener('change', e => {
                subtasks[i].done = e.target.checked;
                renderSubtasks();
            });
            // 点击文字 → 编辑
            row.querySelector('.subtask-text').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const span = e.currentTarget;
                const input = document.createElement('input');
                input.className = 'subtask-edit';
                input.value = subtasks[i].text;
                span.replaceWith(input);
                input.focus();
                input.select();
                const commit = () => {
                    const val = input.value.trim();
                    if (val) subtasks[i].text = val;
                    else subtasks.splice(i, 1);
                    renderSubtasks();
                };
                input.addEventListener('blur', commit);
                input.addEventListener('keydown', ev => {
                    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
                    if (ev.key === 'Escape') { renderSubtasks(); }
                });
            });
            row.querySelector('.subtask-detach').addEventListener('click', async (e) => {
                e.stopPropagation();
                const text = subtasks[i].text;
                subtasks.splice(i, 1);
                renderSubtasks();
                // 创建新的独立任务
                try {
                    await invoke('add_reminder', { list: currentList, title: text });
                } catch (err) { console.error('Detach failed:', err); }
            });
            subtaskList.appendChild(row);
        });
    }
    renderSubtasks();

    overlay.querySelector('.subtask-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.value.trim()) {
            subtasks.push({ done: false, text: e.target.value.trim() });
            e.target.value = '';
            renderSubtasks();
        }
    });

    async function closeAndSave() {
        const newTitle = overlay.querySelector('.detail-title').value.trim();
        const restNotes = overlay.querySelector('.detail-notes').value;
        const newNotes = serializeSubtasks(subtasks, restNotes);
        const newUrl = overlay.querySelector('.detail-url').value.trim();
        const activePriBtn = overlay.querySelector('.priority-btn.active');
        const newPriority = activePriBtn ? parseInt(activePriBtn.dataset.value) : 0;
        try {
            if (newPriority !== (task.priorityValue || 0))
                await invoke('set_priority', { id: task.id, value: newPriority });
            if (newTitle && newTitle !== task.title)
                await invoke('update_field', { id: task.id, field: 'title', value: newTitle });
            if (newNotes !== (task.notes || ''))
                await invoke('update_field', { id: task.id, field: 'notes', value: newNotes });
            if (newUrl !== (task.url || ''))
                await invoke('update_field', { id: task.id, field: 'url', value: newUrl });
            if ((selectedEmoji || '') !== (task.emoji || ''))
                await invoke('update_field', { id: task.id, field: 'emoji', value: selectedEmoji || '' });
        } catch (e) { console.error('Save failed:', e); }
        overlay.remove();
        document.body.style.overflow = '';
        fetchReminders();
    }

    overlay.querySelector('.detail-close').addEventListener('click', closeAndSave);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAndSave(); });
    overlay.querySelector('.complete-btn').addEventListener('click', async () => {
        try {
            await invoke('complete_reminder', { id: task.id });
            overlay.remove();
            document.body.style.overflow = '';
            await fetchReminders();
        } catch (e) { alert('操作失败: ' + e); }
    });
    const deleteBtn = overlay.querySelector('.delete-btn');
    let deleteConfirm = false;
    deleteBtn.addEventListener('click', async () => {
        if (!deleteConfirm) {
            deleteConfirm = true;
            deleteBtn.innerHTML = '<i class="ph ph-trash"></i> 确认删除？';
            deleteBtn.classList.add('confirm');
            setTimeout(() => {
                deleteConfirm = false;
                deleteBtn.innerHTML = '<i class="ph ph-trash"></i> 删除';
                deleteBtn.classList.remove('confirm');
            }, 3000);
            return;
        }
        try {
            await invoke('delete_reminder', { id: task.id });
            overlay.remove();
            document.body.style.overflow = '';
            await fetchReminders();
        } catch (e) { console.error('删除失败:', e); }
    });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') closeAndSave(); });
}

// ── 渲染 ─────────────────────────────────────────
function setStatus(msg, color) {
    const el = document.getElementById('status');
    el.innerHTML = msg;
    el.style.color = color;
}

function createNewList() {
    const container = document.getElementById('projects');
    // 已经有输入框就聚焦
    const existing = container.querySelector('.new-list-input');
    if (existing) { existing.focus(); return; }

    const wrapper = document.createElement('div');
    wrapper.className = 'new-list-wrapper';
    wrapper.innerHTML = `<input class="new-list-input" placeholder="列表名称，回车确认" />`;
    const addBtn = container.querySelector('.add-list-btn');
    container.insertBefore(wrapper, addBtn);

    const input = wrapper.querySelector('input');
    input.focus();

    async function submit() {
        const name = input.value.trim();
        wrapper.remove();
        if (!name) return;
        try {
            await invoke('create_list', { name });
            await loadLists();
            selectList(name);
        } catch (e) { console.error('创建失败:', e); }
    }

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') wrapper.remove();
    });
    input.addEventListener('blur', () => setTimeout(() => wrapper.remove(), 150));
}

function renderListSelector() {
    const container = document.getElementById('projects');
    container.innerHTML = '';
    lists.forEach(l => {
        const btn = document.createElement('button');
        btn.className = 'project-btn';
        btn.dataset.list = l.name;
        if (currentList === l.name) btn.classList.add('active');
        if (l.color) btn.style.setProperty('--list-color', l.color);

        const { emoji: listEmoji, name: displayName } = splitListName(l.name);
        const iconHtml = listEmoji
            ? `<span class="tab-icon has-emoji">${listEmoji}</span>`
            : l.color
                ? `<span class="tab-icon tab-dot" style="background:${l.color}"></span>`
                : `<span class="tab-icon"><i class="ph ph-kanban"></i></span>`;

        btn.innerHTML = `${iconHtml}<span class="tab-label">${displayName}</span>`;

        btn.addEventListener('click', () => selectList(l.name));

        // 双击 tab 文字 → inline rename（不监听 icon 区域）
        btn.querySelector('.tab-label').addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentList !== l.name) return;
            startInlineRename(btn, l.name);
        });

        // 点击 active tab 的 icon → emoji picker
        btn.querySelector('.tab-icon').addEventListener('click', (e) => {
            if (currentList !== l.name) return;
            e.stopPropagation();
            openListEmojiPicker(btn.querySelector('.tab-icon'), l.name);
        });

        container.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'project-btn add-list-btn';
    addBtn.innerHTML = '<i class="ph ph-plus"></i>';
    addBtn.title = '新建列表';
    addBtn.addEventListener('click', createNewList);
    container.appendChild(addBtn);
    parseTwemoji(container);
}

function startInlineRename(btn, listName) {
    const label = btn.querySelector('.tab-label');
    if (!label) return;
    const { emoji: existingEmoji, name: pureName } = splitListName(listName);
    const input = document.createElement('input');
    input.className = 'tab-rename-input';
    input.value = pureName; // 只编辑纯名字部分，不含 emoji
    label.replaceWith(input);
    input.focus();
    input.select();

    async function commit() {
        const newPureName = input.value.trim();
        if (!newPureName || newPureName === pureName) {
            renderListSelector(); return;
        }
        // 拼回 emoji 前缀
        const newFullName = existingEmoji ? `${existingEmoji} ${newPureName}` : newPureName;
        try {
            await invoke('rename_list', { oldName: listName, newName: newFullName });
            currentList = newFullName;
            await loadLists();
            selectList(newFullName);
        } catch (e) {
            console.error('重命名失败:', e);
            renderListSelector();
        }
    }

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { renderListSelector(); }
    });
    input.addEventListener('blur', commit);
}

function openListEmojiPicker(anchor, listName) {
    if (listPicker) { listPicker.close(); listPicker = null; return; }
    listPicker = new TwemojiPicker({
        anchor,
        popover: true,
        onSelect: async (emoji) => {
            const { name: pureName } = splitListName(listName);
            const newName = `${emoji} ${pureName}`;
            try {
                await invoke('rename_list', { oldName: listName, newName });
                if (currentList === listName) currentList = newName;
                await loadLists();
                if (currentList) selectList(currentList);
            } catch (e) { console.error('设置 list emoji 失败:', e); }
        },
        onClose: () => { listPicker = null; listPickerClosedAt = Date.now(); },
    });
    listPicker.open();
}

function parseTwemoji(el) {
    if (typeof twemoji !== 'undefined') {
        twemoji.parse(el || document.body, { folder: 'svg', ext: '.svg' });
    }
}

function render(force = false) {
    // 输入框有焦点时不重建 DOM，避免打断输入法
    const active = document.activeElement;
    if (!force && active && (active.classList.contains('add-input') || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        return;
    }

    const board = document.getElementById('board');
    board.innerHTML = '';

    const statusIcons = { '待办': 'ph-circle-dashed', '进行中': 'ph-spinner', '已完成': 'ph-check-circle' };

    STATUSES.forEach(status => {
        const col = document.createElement('div');
        col.className = 'col';
        col.dataset.status = status;

        const colTasks = tasks.filter(t => t.status === status);
        const icon = statusIcons[status] || 'ph-circle';
        col.innerHTML = `<div class="col-header"><h2><i class="ph ${icon}"></i> ${status}</h2><span class="count">${colTasks.length}</span></div>`;

        colTasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.id = task.id;
            if (task.completed) card.classList.add('completed');
            let badges = '';
            if (task.flagged) {
                badges += `<span class="badge badge-red"><span class="priority-dot dot-red"></span> 高</span>`;
            } else if (task.priority) {
                const dotCls = task.priority === 'high' ? 'dot-red' : task.priority === 'medium' ? 'dot-orange' : 'dot-blue';
                const label = task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低';
                const badgeCls = task.priority === 'high' ? 'badge-red' : task.priority === 'medium' ? 'badge-orange' : 'badge-default';
                badges += `<span class="badge ${badgeCls}"><span class="priority-dot ${dotCls}"></span> ${label}</span>`;
            }
            if (task.dueDate) {
                const isOverdue = new Date(task.dueDate) < new Date();
                badges += `<span class="badge ${isOverdue ? 'badge-red' : 'badge-default'}"><i class="ph ph-calendar-blank"></i> ${task.dueDate}</span>`;
            }
            let meta = '';
            let subtaskHtml = '';
            if (task.url) {
                meta += `<span class="card-tag"><i class="ph ph-link"></i></span>`;
            }
            if (task.notes) {
                const { subtasks, rest } = parseSubtasks(task.notes);
                if (subtasks.length > 0) {
                    const done = subtasks.filter(s => s.done).length;
                    meta += `<span class="card-tag"><i class="ph ph-checks"></i> ${done}/${subtasks.length}</span>`;
                    subtaskHtml = '<div class="card-subtasks">' + subtasks.map(s =>
                        `<div class="card-subtask ${s.done ? 'done' : ''}"><i class="ph ${s.done ? 'ph-check-square' : 'ph-square'}"></i> ${s.text}</div>`
                    ).join('') + '</div>';
                }
                if (rest) {
                    meta += `<span class="card-tag"><i class="ph ph-note-pencil"></i></span>`;
                }
            }
            const emojiHtml = task.emoji ? `<span class="card-emoji">${task.emoji}</span> ` : '';
            card.innerHTML = `
                <div class="card-title">${emojiHtml}${task.title}</div>
                ${subtaskHtml}
                ${badges || meta ? `<div class="card-meta">${badges}${meta}</div>` : ''}
            `;
            card.addEventListener('mousedown', e => onMouseDown(e, task.id));
            card.addEventListener('click', () => { if (!dragState || !dragState.started) showDetail(task); });
            col.appendChild(card);
        });

        // 待办列底部加新增
        if (status === '待办') {
            const addBox = document.createElement('div');
            addBox.className = 'add-box';
            addBox.innerHTML = `<input class="add-input" placeholder="新增任务，回车确认" />`;
            addBox.querySelector('input').addEventListener('keydown', e => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                    addTask(e.target.value);
                    e.target.value = '';
                }
            });
            col.appendChild(addBox);
        }

        board.appendChild(col);
    });

    // 原生 emoji → Twemoji SVG
    parseTwemoji(board);

}

init();
