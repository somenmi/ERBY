let nodes = [];
let connections = [];
let editingNode = null;
let isConnecting = false;
let startNode = null;
let offsetX, offsetY;
let selectedNode = null;
let isAllLocked = false;
let gridBackground = null;
let selectedTemplate = null;
let isFirstConfirm = false;
let isModalOpen = false;
let notepadContent = '';
let autoSaveTimeout = null;
let isNotepadOpen = false;
let currentFontSize = 14;
let mouseIsDown = false;
let isDragging = false;
let dragStartX, dragStartY;

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 32;

const canvas = document.getElementById('roadmapCanvas');
const nodeModal = document.getElementById('nodeModal');
const helpModal = document.getElementById('helpModal');
const templatesModal = document.getElementById('templatesModal');
const tooltip = document.getElementById('tooltip');
const lockBtn = document.getElementById('lockBtn');
const connectBtn = document.getElementById('connectBtn');
const nativeColorPicker = document.getElementById('nativeColorPicker');

class Node {
    constructor(id, title, description, x, y, color = '#3c4385') {
        this.id = id;
        this.title = title;
        this.description = description;
        this.x = x;
        this.y = y;
        this.color = color;
        this.progress = Array(12).fill(0);
        this.locked = false;
    }
}

class Connection {
    constructor(fromId, toId) {
        this.id = `${fromId}_${toId}`;
        this.fromId = fromId;
        this.toId = toId;
    }
}

function updateClock() {
    const now = new Date();
    document.getElementById('clock-hh').textContent = now.getHours().toString().padStart(3, 'O');
    document.getElementById('clock-mm').textContent = now.getMinutes().toString().padStart(3, 'O');
    document.getElementById('clock-ss').textContent = now.getSeconds().toString().padStart(3, 'O');
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('pwa.js')
            .then(registration => {
                console.log('✅ Service Worker зарегистрирован');
            })
            .catch(err => {
                console.log('❌ Ошибка регистрации Service Worker:', err);
            });
    }
}

function init() {
    loadData();
    renderAll();
    setupEventListeners();
    setupNotepadAutosave();
    setInterval(updateClock, 1000);
    updateClock();
    registerServiceWorker();

    gridBackground = document.getElementById('gridBackground');

    checkAllNodesLocked();

    if (!localStorage.getItem('roadmapFirstRun')) {
        setTimeout(() => {
            if (confirm('Привет! Это ваш первый запуск ERBY: Easy Roadmap Builder of Yalkee. Хотите посмотреть справку? (Справка - иконка в верхнем левом углу')) {
                showHelp();
            }
            setTimeout(() => {
                if (nodes.length === 0) {
                    if (confirm('Хотите начать с готового шаблона? (икнока ниже после "Справки")')) {
                        showTemplates();
                    }
                }
            }, 500);
        }, 1000);
        localStorage.setItem('roadmapFirstRun', 'true');
    }
}

function setupEventListeners() {
    canvas.addEventListener('click', canvasClick);
    canvas.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('resize', renderAll);

    document.addEventListener('click', (e) => {
        if (e.target === nodeModal) closeModal();
        if (e.target === helpModal) closeHelp();
        if (e.target === templatesModal) closeTemplatesModal();
    });

    nativeColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        document.getElementById('nodeColor').value = color;
        updateColorSelection(color);

        if (editingNode) {
            applyColorToPreview(color);
        }
    });

    document.getElementById('nodeColor').addEventListener('input', (e) => {
        let color = e.target.value.trim();
        if (!color.startsWith('#')) {
            color = '#' + color;
        }
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            nativeColorPicker.value = color;
            updateColorSelection(color);

            if (editingNode) {
                applyColorToPreview(color);
            }
        }
    });
}

function addNode(title = 'Новый этап', description = 'Описание', x = 100, y = 440, color = '#35506eff') {
    const id = 'node_' + Date.now();
    const node = new Node(id, title, description, x, y, color);
    nodes.push(node);
    saveData();
    renderAll();
    return node;
}

function editNode(node) {
    editingNode = node;
    isModalOpen = true;
    document.getElementById('modalTitle').textContent = 'Редактировать контейнер';
    document.getElementById('nodeTitle').value = node.title;
    document.getElementById('nodeDesc').value = node.description;

    const color = node.color || '#3c4385';
    document.getElementById('nodeColor').value = color;
    nativeColorPicker.value = color;

    updateColorSelection(color);

    nodeModal.style.display = 'flex';
    document.getElementById('nodeTitle').focus();
}

function updateColorSelection(color) {
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('selected');
        const optionColor = option.style.backgroundColor;
        if (rgbToHex(optionColor) === color.toLowerCase()) {
            option.classList.add('selected');
        }
    });
}

function applyColorToPreview(color) {
    editingNode.color = color;
    const nodeElement = document.getElementById(editingNode.id);
    if (nodeElement) {
        nodeElement.style.backgroundColor = color;
        nodeElement.style.borderColor = darkenColor(color, 0.75);
    }
}

function selectColor(color) {
    document.getElementById('nodeColor').value = color;
    nativeColorPicker.value = color;
    updateColorSelection(color);

    if (editingNode) {
        applyColorToPreview(color);
    }
}

function deleteEditingNode() {
    if (!editingNode) return;

    if (confirm(`Удалить контейнер "${editingNode.title}"?`)) {
        const nodeId = editingNode.id;
        closeModal();

        nodes = nodes.filter(n => n.id !== nodeId);
        connections = connections.filter(c => c.fromId !== nodeId && c.toId !== nodeId);

        saveData();
        renderAll();
        showTooltip('Контейнер удален', 1500);
    }
}

function darkenColor(hexColor, factor = 0.75) {
    let color = hexColor.replace('#', '');

    if (color.length === 3) {
        color = color.split('').map(c => c + c).join('');
    }

    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);

    const darkenedR = Math.floor(r * factor);
    const darkenedG = Math.floor(g * factor);
    const darkenedB = Math.floor(b * factor);

    return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
}

function rgbToHex(rgb) {
    if (rgb.startsWith('#')) return rgb.toLowerCase();

    if (rgb.startsWith('rgb')) {
        const values = rgb.match(/\d+/g);
        if (values && values.length >= 3) {
            const r = parseInt(values[0]).toString(16).padStart(2, '0');
            const g = parseInt(values[1]).toString(16).padStart(2, '0');
            const b = parseInt(values[2]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
    }
    return '#3c4385';
}

function saveNode() {
    if (!editingNode) return;

    editingNode.title = document.getElementById('nodeTitle').value.trim() || 'Без названия';
    editingNode.description = document.getElementById('nodeDesc').value.trim() || 'Описание';

    let color = document.getElementById('nodeColor').value.trim();
    if (!color.startsWith('#')) {
        color = '#' + color;
    }
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
        color = '#3c4385';
    }
    editingNode.color = color;

    closeModal();
    saveData();
    renderAll();
    showTooltip('Изменения сохранены', 1500);
}

function closeModal() {
    nodeModal.style.display = 'none';
    editingNode = null;
    isModalOpen = false;
}

function showHelp() {
    helpModal.style.display = 'flex';
    isModalOpen = true;
}

function closeHelp() {
    helpModal.style.display = 'none';
    isModalOpen = false;
}

function toggleProgressSquare(node, index, event) {
    event.stopPropagation();

    if (node.locked) return;

    const isCurrentlyActive = node.progress[index] === 1;

    if (isCurrentlyActive && index === 0) {
        // Если кликнули на первый активный квадрат - сбрасываем все
        node.progress.fill(0);
    } else if (isCurrentlyActive) {
        // Если кликнули на активный квадрат (не первый) - сбрасываем все после него
        for (let i = 0; i < 12; i++) {
            node.progress[i] = i <= index ? 1 : 0;
        }
    } else {
        // Если кликнули на неактивный квадрат - заполняем до него включительно
        for (let i = 0; i < 12; i++) {
            node.progress[i] = i <= index ? 1 : 0;
        }
    }

    saveData();
    renderAll();

    const level = index < 3 ? 'Начальный' :
        index < 6 ? 'Средний' :
            index < 9 ? 'Продвинутый' : 'Эксперт';
    showTooltip(`Прогресс: ${level} (${index + 1}/12)`, 1500);
}

function toggleConnectionMode() {
    isConnecting = !isConnecting;
    startNode = null;

    if (isConnecting) {
        connectBtn.classList.add('active');
        showTooltip('Режим связей: кликните на первый контейнер', 3000);
    } else {
        connectBtn.classList.remove('active');
        showTooltip('Режим связей выключен', 1500);
    }
}

function toggleLockAll() {
    if (isModalOpen) return;

    if (isAllLocked) {
        isAllLocked = false;
        lockBtn.classList.remove('active');
        lockBtn.innerHTML = '<i class="fas fa-unlock"></i>';
        showTooltip('Контейнеры разблокированы', 2000);

        if (gridBackground) {
            gridBackground.classList.remove('active');
        }

    } else {
        isAllLocked = true;
        lockBtn.classList.add('active');
        lockBtn.innerHTML = '<i class="fas fa-lock"></i>';
        showTooltip('Все контейнеры заблокированы', 2000);

        if (gridBackground) {
            gridBackground.classList.add('active');
        }
    }

    saveData();
    renderAll();
}

function toggleLockNode(node, event) {
    if (event) event.preventDefault();

    if (isAllLocked) {
        isAllLocked = false;
        lockBtn.classList.remove('active');
        lockBtn.innerHTML = '<i class="fas fa-lock"></i>';

        if (gridBackground) {
            gridBackground.classList.remove('active');
        }

        // Блокируем/разблокируем конкретный узел
        node.locked = !node.locked;

        showTooltip(`Общая блокировка снята. Контейнер "${node.title}" ${node.locked ? 'заблокирован' : 'разблокирован'}`, 2000);
    } else {
        node.locked = !node.locked;

        const status = node.locked ? 'заблокирован' : 'разблокирован';
        showTooltip(`Контейнер "${node.title}" ${status}`, 1500);

        checkAllNodesLocked();
    }

    saveData();
    renderAll();
}

function checkAllNodesLocked() {
    const allNodesLocked = nodes.length > 0 && nodes.every(node => node.locked);

    if (allNodesLocked && !isAllLocked) {
        if (confirm('Все контейнеры заблокированы. Включить общий режим блокировки с анимированным фоном?')) {
            toggleLockAll();
        }
    }
}

function createConnection(fromNode, toNode) {
    if (fromNode.id === toNode.id) {
        showTooltip('Нельзя соединить контейнер с самим собой', 2000);
        return;
    }

    const existingConn = connections.find(c =>
        (c.fromId === fromNode.id && c.toId === toNode.id) ||
        (c.fromId === toNode.id && c.toId === fromNode.id)
    );

    if (existingConn) {
        showTooltip('Связь уже существует', 2000);
        return;
    }

    connections.push(new Connection(fromNode.id, toNode.id));
    saveData();
    renderAll();
    showTooltip(`Связь создана: ${fromNode.title} → ${toNode.title}`, 2000);
}

function deleteConnection(conn) {
    const fromNode = nodes.find(n => n.id === conn.fromId);
    const toNode = nodes.find(n => n.id === conn.toId);
    connections = connections.filter(c => c.id !== conn.id);
    saveData();
    renderAll();

    if (fromNode && toNode) {
        showTooltip(`Связь удалена: ${fromNode.title} → ${toNode.title}`, 2000);
    }
}

function renderAll() {
    canvas.innerHTML = '';

    connections.forEach(conn => {
        const fromNode = nodes.find(n => n.id === conn.fromId);
        const toNode = nodes.find(n => n.id === conn.toId);
        if (fromNode && toNode) {
            drawConnection(fromNode, toNode, conn);
        }
    });

    nodes.forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'node';
        nodeEl.id = node.id;
        nodeEl.style.left = node.x + 'px';
        nodeEl.style.top = node.y + 'px';
        nodeEl.style.backgroundColor = node.color || '#3c4385';

        // Если узел заблокирован
        if (node.locked) {
            nodeEl.classList.add('locked');
            nodeEl.style.cursor = 'default';
        }

        // Если выбранный узел и мышь нажата - сохраняем выделение
        if (selectedNode && selectedNode.id === node.id && mouseIsDown) {
            nodeEl.style.zIndex = '100';
            nodeEl.style.boxShadow = '0 0 0 2px #ffd000, 0 4px 16px rgba(0, 0, 0, 0.4)';
        }

        const borderColor = darkenColor(node.color || '#3c4385', 0.75);
        nodeEl.style.borderColor = borderColor;

        const progressSquares = node.progress.map((filled, i) => {
            let color;
            if (i < 3) color = '#ef5350';
            else if (i < 6) color = '#ff9800';
            else if (i < 9) color = '#ffca28';
            else color = '#66bb6a';

            const isActive = filled ? '' : 'inactive';
            const bgColor = filled ? color : '#555';
            return `<div class="progress-square ${isActive}" 
                         style="background-color: ${bgColor}"
                         title="${i < 3 ? 'Начальный уровень' : i < 6 ? 'Средний уровень' : i < 9 ? 'Продвинутый' : 'Эксперт'} (${i + 1}/12)">
                    </div>`;
        }).join('');

        nodeEl.innerHTML = `
            ${node.locked ? '<div class="lock-status"><i class="fas fa-lock"></i></div>' : ''}
            <div class="node-header">
                <div class="title-container">
                    <div class="node-title" title="${escapeHtml(node.title)}">${escapeHtml(node.title)}</div>
                </div>
            </div>
            <div class="node-description" title="${escapeHtml(node.description)}">${escapeHtml(node.description)}</div>
            <div class="progress-scale">
                ${progressSquares}
            </div>
        `;

        const progressSquaresEls = nodeEl.querySelectorAll('.progress-square');
        progressSquaresEls.forEach((square, index) => {
            square.addEventListener('click', (e) => toggleProgressSquare(node, index, e));
        });

        nodeEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            toggleLockNode(node, e);
        });

        nodeEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('progress-square') ||
                e.target.classList.contains('progress-scale')) {
                return;
            }

            if (isConnecting) {
                e.stopPropagation();

                if (!startNode) {
                    startNode = node;
                    showTooltip(`Выбран: ${node.title}. Кликните на второй контейнер`, 3000);
                } else {
                    if (startNode.id === node.id) {
                        showTooltip('Выберите другой контейнер', 2000);
                        return;
                    }

                    createConnection(startNode, node);

                    isConnecting = false;
                    startNode = null;
                    connectBtn.classList.remove('active');
                }
            }
        });

        nodeEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            editNode(node);
        });

        canvas.appendChild(nodeEl);
    });

    // Выделяем соединения выбранного узла если мышь нажата
    if (selectedNode && mouseIsDown) {
        highlightNodeConnections(selectedNode.id, true);
    }
}

function drawConnection(fromNode, toNode, conn) {
    const line = document.createElement('div');
    line.className = 'connection';
    line.dataset.connectionId = conn.id;

    const x1 = fromNode.x + 106;
    const y1 = fromNode.y + 40;
    const x2 = toNode.x + 106;
    const y2 = toNode.y + 40;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    line.style.width = length + 'px';
    line.style.left = x1 + 'px';
    line.style.top = y1 + 'px';
    line.style.transform = `rotate(${angle}deg)`;
    line.title = `${fromNode.title} → ${toNode.title}\nКлик для удаления`;

    line.onclick = (e) => {
        e.stopPropagation();
        deleteConnection(conn);
    };

    canvas.appendChild(line);
}

function canvasClick(e) {
    if (isModalOpen) return;

    if (e.target.closest('.node')) {
        return;
    }

    if (isConnecting && !e.target.closest('.node') && !e.target.closest('.connection')) {
        isConnecting = false;
        startNode = null;
        connectBtn.classList.remove('active');
        showTooltip('Режим связей отменен', 1500);
    }
}

function startDrag(e) {
    if (isConnecting) return;

    if (isModalOpen) return;

    if (isAllLocked) return;

    if (e.target.classList.contains('progress-square') ||
        e.target.classList.contains('progress-scale') ||
        e.target.classList.contains('node-description')) {
        return;
    }

    const nodeEl = e.target.closest('.node');
    if (!nodeEl) return;

    const node = nodes.find(n => n.id === nodeEl.id);
    if (!node || node.locked) return;

    selectedNode = node;
    offsetX = e.clientX - node.x;
    offsetY = e.clientY - node.y;
    mouseIsDown = true;

    // Добавление и выделение узла
    nodeEl.style.zIndex = '100';
    nodeEl.style.boxShadow = '0 0 0 2px #ffd000, 0 4px 16px rgba(0, 0, 0, 0.4)';

    highlightNodeConnections(node.id, true);
}

function drag(e) {
    if (!selectedNode || !mouseIsDown) return;

    // Если включена общая блокировка - не перемещаем
    if (isAllLocked) {
        endDrag();
        return;
    }

    const newX = e.clientX - offsetX;
    const newY = e.clientY - offsetY;

    const canvasRect = canvas.getBoundingClientRect();
    const maxX = canvasRect.width - 212;
    const maxY = canvasRect.height - 50;

    selectedNode.x = Math.max(0, Math.min(newX, maxX));
    selectedNode.y = Math.max(0, Math.min(newY, maxY));

    renderAll();

    const nodeEl = document.getElementById(selectedNode.id);
    if (nodeEl) {
        nodeEl.style.zIndex = '100';
        nodeEl.style.boxShadow = '0 0 0 2px #ffd000, 0 4px 16px rgba(0, 0, 0, 0.4)';
    }

    highlightNodeConnections(selectedNode.id, true);
}

function endDrag() {
    if (selectedNode && mouseIsDown) {
        const nodeEl = document.getElementById(selectedNode.id);
        if (nodeEl) {
            nodeEl.style.zIndex = '10';
            nodeEl.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        }

        highlightNodeConnections(selectedNode.id, false);

        saveData();

        mouseIsDown = false;
        selectedNode = null;

        renderAll();
    }
}

function highlightNodeConnections(nodeId, highlight) {
    const relatedConnections = connections.filter(conn =>
        conn.fromId === nodeId || conn.toId === nodeId
    );

    relatedConnections.forEach(conn => {
        const connectionEl = document.querySelector(`[data-connection-id="${conn.id}"]`);
        if (connectionEl) {
            if (highlight) {
                connectionEl.classList.add('active');
            } else {
                connectionEl.classList.remove('active');
            }
        }
    });
}

function handleKeyPress(e) {
    if (isModalOpen && !isNotepadOpen) {
        if (e.key === 'Escape') {
            if (nodeModal.style.display === 'flex') closeModal();
            if (helpModal.style.display === 'flex') closeHelp();
            if (templatesModal.style.display === 'flex') closeTemplatesModal();
        }
        return;
    }

    if (isNotepadOpen) {
        if (e.ctrlKey) {
            switch (e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    formatText('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    formatText('italic');
                    break;
                case 'u':
                    e.preventDefault();
                    formatText('underline');
                    break;
                case 's':
                    e.preventDefault();
                    saveNotepadContent();
                    showTooltip('Заметки сохранены', 1500);
                    break;
            }
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            toggleNotepad();
        }
        return;
    }

    if (e.key === 'F1') {
        e.preventDefault();
        showHelp();
    }

    if (e.key === 'Escape') {
        closeModal();
        closeHelp();
        closeTemplatesModal();
        isConnecting = false;
        startNode = null;
        connectBtn.classList.remove('active');
        selectedNode = null;
    }

    if (e.key === 'Delete' && selectedNode) {
        deleteNode(selectedNode);
    }

    if (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д') {
        e.preventDefault();
        toggleLockAll();
    }

    if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
        e.preventDefault();
        toggleConnectionMode();
    }

    if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') {
        e.preventDefault();
        toggleNotepad();
    }

    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
        if (e.ctrlKey) {
            e.preventDefault();
            exportData();
        } else {
            e.preventDefault();
            saveAll();
        }
    }

    if (e.ctrlKey && (e.key === 's' || e.key === 'ы')) {
        e.preventDefault();
        exportData();
    }
}

function deleteNode(node) {
    if (!confirm(`Удалить контейнер "${node.title}"?`)) return;

    nodes = nodes.filter(n => n.id !== node.id);
    connections = connections.filter(c => c.fromId !== node.id && c.toId !== node.id);

    saveData();
    renderAll();
    showTooltip('Контейнер удален', 1500);
}

function saveData() {
    const data = {
        nodes,
        connections,
        notepad: notepadContent,
        notepadFontSize: currentFontSize,
        version: '1.0'
    };
    localStorage.setItem('roadmapData', JSON.stringify(data));
}

function loadData() {
    const saved = localStorage.getItem('roadmapData');
    if (saved) {
        try {
            const data = JSON.parse(saved);

            nodes = (data.nodes || []).map(n => {
                const node = Object.assign(new Node(), n);
                if (!node.color) {
                    node.color = '#3c4385';
                }
                return node;
            });

            connections = data.connections || [];

            if (data.notepad) {
                notepadContent = data.notepad;
                localStorage.setItem('roadmapNotepad', notepadContent);
            } else {
                const oldNotepad = localStorage.getItem('roadmapNotepad');
                if (oldNotepad) {
                    notepadContent = oldNotepad;
                }
            }

            if (data.notepadFontSize) {
                currentFontSize = data.notepadFontSize;
                localStorage.setItem('notepadFontSize', currentFontSize.toString());
            } else {
                const savedSize = localStorage.getItem('notepadFontSize');
                if (savedSize) {
                    const size = parseInt(savedSize, 10);
                    if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) {
                        currentFontSize = size;
                    }
                }
            }

            return;
        } catch (e) {
            console.error('Ошибка загрузки данных:', e);
        }
    }

    const savedSize = localStorage.getItem('notepadFontSize');
    if (savedSize) {
        const size = parseInt(savedSize, 10);
        if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) {
            currentFontSize = size;
        }
    }
}

function saveAll() {
    if (isNotepadOpen) {
        const textarea = document.getElementById('notepadText');
        notepadContent = textarea.value;
    }

    saveData();
    showTooltip('Данные сохранены в браузере', 2000);
}

function loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);

                nodes = (data.nodes || []).map(n => {
                    const node = Object.assign(new Node(), n);
                    if (!node.color) {
                        node.color = '#3c4385';
                    }
                    return node;
                });

                connections = data.connections || [];

                if (data.notepad) {
                    notepadContent = data.notepad;
                } else {
                    notepadContent = '';
                }

                if (data.notepadFontSize) {
                    currentFontSize = data.notepadFontSize;
                }

                saveData();

                if (isNotepadOpen) {
                    document.getElementById('notepadText').value = notepadContent;
                    loadFontSize();
                    updateStats();
                }

                renderAll();
                showTooltip('Данные загружены из файла (с заметками и настройками)', 2000);
            } catch (error) {
                showTooltip('Ошибка загрузки файла', 3000);
                console.error(error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function exportData() {
    // Обновляем содержимое блокнота перед экспортом
    if (isNotepadOpen) {
        const textarea = document.getElementById('notepadText');
        notepadContent = textarea.value;
    }

    const data = {
        nodes,
        connections,
        notepad: notepadContent,
        notepadFontSize: currentFontSize,
        version: '1.0',
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ERBY_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showTooltip('Данные экспортированы в JSON (с заметками и настройками)', 2000);
}

function showTooltip(text, duration = 2000) {
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    tooltip.style.left = '50%';
    tooltip.style.top = '20px';
    tooltip.style.transform = 'translateX(-50%)';

    setTimeout(() => {
        tooltip.style.display = 'none';
    }, duration);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTemplates() {
    if (isModalOpen) return;

    if (nodes.length > 0) {
        if (confirm('Использование шаблона приведёт к потере текущих данных. Продолжить?')) {
            openTemplatesModal();
        }
    } else {
        openTemplatesModal();
    }
}

function openTemplatesModal() {
    templatesModal.style.display = 'flex';
    isModalOpen = true;
    document.getElementById('confirmDialog').style.display = 'none';
    selectedTemplate = null;
    isFirstConfirm = false;

    document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('selected');
    });
}

function closeTemplatesModal() {
    templatesModal.style.display = 'none';
    isModalOpen = false;
}

function selectTemplate(templateId) {
    selectedTemplate = templateId;
    isFirstConfirm = false;

    document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`.template-card[data-template="${templateId}"]`).classList.add('selected');

    const confirmDialog = document.getElementById('confirmDialog');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmTemplateBtn');

    if (!isFirstConfirm) {
        confirmMessage.textContent = 'Вы уверены, что хотите загрузить этот шаблон?';
        confirmBtn.textContent = 'Да, продолжить';
        confirmBtn.onclick = confirmFirstStep;
        confirmDialog.style.display = 'block';
        isFirstConfirm = true;
    }
}

function confirmFirstStep() {
    if (!isFirstConfirm || !selectedTemplate) return;

    const confirmMessage = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmTemplateBtn');

    confirmMessage.textContent = 'Это приведёт к полной потере текущей таблицы. Всё сохранённое будет перезаписано. При необходимости сделайте экспорт в JSON.';
    confirmBtn.textContent = 'Я понимаю, продолжить';
    confirmBtn.onclick = applyTemplate;
}

function cancelTemplate() {
    document.getElementById('confirmDialog').style.display = 'none';
    selectedTemplate = null;
    isFirstConfirm = false;

    document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('selected');
    });
}

function applyTemplate() {
    if (!selectedTemplate) {
        closeTemplatesModal();
        return;
    }

    nodes = [];
    connections = [];
    notepadContent = '';

    const template = getTemplateData(selectedTemplate);

    if (template) {
        nodes = template.nodes.map(n => Object.assign(new Node(), n));
        connections = template.connections || [];

        saveData();
        renderAll();

        // Если блокнот открыт - обновляем его содержимое
        if (isNotepadOpen) {
            document.getElementById('notepadText').value = '';
            loadFontSize();
            updateStats();
        }

        showTooltip(`Шаблон "${getTemplateName(selectedTemplate)}" загружен`, 3000);
    }

    closeTemplatesModal();
}

function getTemplateData(templateId) {
    const templates = {
        'empty': {
            nodes: [],
            connections: []
        },
        'roadmap1': {
            "nodes": [
                {
                    "id": "nt1_1",
                    "title": "Основной этап",
                    "description": "Начальная точка вашей дорожной карты",
                    "x": 42,
                    "y": 453,
                    "color": "#3c4385",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_2",
                    "title": "Подэтап 1",
                    "description": "Первый важный шаг",
                    "x": 572,
                    "y": 271,
                    "color": "#b84d2d",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_3",
                    "title": "Подэтап 2",
                    "description": "Второй важный шаг",
                    "x": 578,
                    "y": 418,
                    "color": "#b84d2d",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_4",
                    "title": "Подэтап 3",
                    "description": "Третий важный шаг",
                    "x": 581,
                    "y": 556,
                    "color": "#b84d2d",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_5",
                    "title": "Центральный узел",
                    "description": "Координационный центр",
                    "x": 314,
                    "y": 450,
                    "color": "#4a1f10",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_6",
                    "title": "Подэтап 4",
                    "description": "Четвертый важный шаг",
                    "x": 537,
                    "y": 699,
                    "color": "#b84d2d",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_7",
                    "title": "Промежуточный этап A",
                    "description": "Переход к финальной части",
                    "x": 878,
                    "y": 622,
                    "color": "#2b755f",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_8",
                    "title": "Промежуточный этап B",
                    "description": "Второй переход",
                    "x": 873,
                    "y": 319,
                    "color": "#2b5f75",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_9",
                    "title": "Объединяющий этап",
                    "description": "Сбор всех ветвей",
                    "x": 1061,
                    "y": 460,
                    "color": "#3b3b3b",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_10",
                    "title": "Финальная подготовка",
                    "description": "Подготовка к завершению",
                    "x": 1343,
                    "y": 455,
                    "color": "#307db1",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_11",
                    "title": "Верхний финал",
                    "description": "Верхняя финальная точка",
                    "x": 1404,
                    "y": 286,
                    "color": "#307db1",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_12",
                    "title": "Финальная цель",
                    "description": "Конечный результат",
                    "x": 1610,
                    "y": 456,
                    "color": "#b39430",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt1_13",
                    "title": "Нижний финал",
                    "description": "Нижняя финальная точка",
                    "x": 1398,
                    "y": 629,
                    "color": "#307db1",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                }
            ],
            "connections": [
                { "id": "nt1_1_nt1_5", "fromId": "nt1_1", "toId": "nt1_5" },
                { "id": "nt1_5_nt1_3", "fromId": "nt1_5", "toId": "nt1_3" },
                { "id": "nt1_5_nt1_2", "fromId": "nt1_5", "toId": "nt1_2" },
                { "id": "nt1_5_nt1_4", "fromId": "nt1_5", "toId": "nt1_4" },
                { "id": "nt1_5_nt1_6", "fromId": "nt1_5", "toId": "nt1_6" },
                { "id": "nt1_2_nt1_8", "fromId": "nt1_2", "toId": "nt1_8" },
                { "id": "nt1_3_nt1_8", "fromId": "nt1_3", "toId": "nt1_8" },
                { "id": "nt1_4_nt1_7", "fromId": "nt1_4", "toId": "nt1_7" },
                { "id": "nt1_6_nt1_7", "fromId": "nt1_6", "toId": "nt1_7" },
                { "id": "nt1_7_nt1_9", "fromId": "nt1_7", "toId": "nt1_9" },
                { "id": "nt1_8_nt1_9", "fromId": "nt1_8", "toId": "nt1_9" },
                { "id": "nt1_9_nt1_10", "fromId": "nt1_9", "toId": "nt1_10" },
                { "id": "nt1_11_nt1_10", "fromId": "nt1_11", "toId": "nt1_10" },
                { "id": "nt1_12_nt1_11", "fromId": "nt1_12", "toId": "nt1_11" },
                { "id": "nt1_10_nt1_12", "fromId": "nt1_10", "toId": "nt1_12" },
                { "id": "nt1_10_nt1_13", "fromId": "nt1_10", "toId": "nt1_13" },
                { "id": "nt1_13_nt1_12", "fromId": "nt1_13", "toId": "nt1_12" }
            ]
        },
        'roadmap2': {
            "nodes": [
                {
                    "id": "nt2_1",
                    "title": "Центральный узел",
                    "description": "Основная точка координации",
                    "x": 889,
                    "y": 17,
                    "color": "#3c4385",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_2",
                    "title": "Нижний уровень",
                    "description": "Базовые операции",
                    "x": 891,
                    "y": 397,
                    "color": "#3f2342",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_3",
                    "title": "Средний уровень",
                    "description": "Промежуточные задачи",
                    "x": 892,
                    "y": 278,
                    "color": "#204f2a",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_4",
                    "title": "Левый узел",
                    "description": "Левая ветвь развития",
                    "x": 697,
                    "y": 155,
                    "color": "#1c374d",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_5",
                    "title": "Правый узел",
                    "description": "Правая ветвь развития",
                    "x": 1083,
                    "y": 148,
                    "color": "#1c374d",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_6",
                    "title": "Левый процесс",
                    "description": "Детали левого процесса",
                    "x": 598,
                    "y": 496,
                    "color": "#533857",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_7",
                    "title": "Центральный процесс",
                    "description": "Основной рабочий процесс",
                    "x": 883,
                    "y": 567,
                    "color": "#533857",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_8",
                    "title": "Правый процесс",
                    "description": "Детали правого процесса",
                    "x": 1170,
                    "y": 491,
                    "color": "#533857",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_9",
                    "title": "Финальный этап",
                    "description": "Завершение всех процессов",
                    "x": 883,
                    "y": 741,
                    "color": "#694f2f",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                },
                {
                    "id": "nt2_10",
                    "title": "Поддержка",
                    "description": "Вспомогательный этап",
                    "x": 417,
                    "y": 202,
                    "color": "#1b4a70",
                    "progress": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    "locked": false
                }
            ],
            "connections": [
                { "id": "nt2_1_nt2_4", "fromId": "nt2_1", "toId": "nt2_4" },
                { "id": "nt2_5_nt2_1", "fromId": "nt2_5", "toId": "nt2_1" },
                { "id": "nt2_3_nt2_5", "fromId": "nt2_3", "toId": "nt2_5" },
                { "id": "nt2_3_nt2_4", "fromId": "nt2_3", "toId": "nt2_4" },
                { "id": "nt2_10_nt2_4", "fromId": "nt2_10", "toId": "nt2_4" },
                { "id": "nt2_6_nt2_2", "fromId": "nt2_6", "toId": "nt2_2" },
                { "id": "nt2_2_nt2_3", "fromId": "nt2_2", "toId": "nt2_3" },
                { "id": "nt2_8_nt2_2", "fromId": "nt2_8", "toId": "nt2_2" },
                { "id": "nt2_8_nt2_7", "fromId": "nt2_8", "toId": "nt2_7" },
                { "id": "nt2_6_nt2_7", "fromId": "nt2_6", "toId": "nt2_7" },
                { "id": "nt2_7_nt2_9", "fromId": "nt2_7", "toId": "nt2_9" }
            ]
        }
    };

    const template = templates[templateId];
    if (!template) return null;

    const idMap = {};
    template.nodes.forEach(node => {
        const newId = 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        idMap[node.id] = newId;
        node.id = newId;
    });

    template.connections.forEach(conn => {
        conn.id = idMap[conn.fromId] + '_' + idMap[conn.toId];
        conn.fromId = idMap[conn.fromId];
        conn.toId = idMap[conn.toId];
    });

    return template;
}

function getTemplateName(templateId) {
    const names = {
        'empty': 'Пустой шаблон',
        'roadmap1': 'Дорожная карта 1',
        'roadmap2': 'Дорожная карта 2'
    };
    return names[templateId] || 'Шаблон';
}

function toggleNotepad() {
    if (isModalOpen && !isNotepadOpen) return;

    isNotepadOpen = !isNotepadOpen;
    document.getElementById('notepadModal').style.display = isNotepadOpen ? 'flex' : 'none';
    isModalOpen = isNotepadOpen;

    if (isNotepadOpen) {
        loadNotepadContent();
        document.getElementById('notepadText').focus();
        updateStats();
    } else {
        saveNotepadContent();
    }
}

function loadNotepadContent() {
    const saved = localStorage.getItem('roadmapData');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.notepad) {
                notepadContent = data.notepad;
                document.getElementById('notepadText').value = notepadContent;

                if (data.notepadFontSize) {
                    currentFontSize = data.notepadFontSize;
                }

                updateStats();

                loadFontSize();
                return;
            }
        } catch (e) {
            console.error('Ошибка загрузки блокнота:', e);
        }
    }

    const oldSaved = localStorage.getItem('roadmapNotepad');
    if (oldSaved) {
        notepadContent = oldSaved;
        document.getElementById('notepadText').value = notepadContent;
    } else {
        notepadContent = '';
        document.getElementById('notepadText').value = '';
    }

    loadFontSize();

    updateStats();
}

function saveNotepadContent() {
    if (isNotepadOpen) {
        const textarea = document.getElementById('notepadText');
        notepadContent = textarea.value;

        saveData();

        localStorage.setItem('roadmapNotepad', notepadContent);
        localStorage.setItem('notepadFontSize', currentFontSize.toString());
    }

    showAutoSaveStatus('saved');
}

function setupNotepadAutosave() {
    const textarea = document.getElementById('notepadText');

    textarea.addEventListener('input', () => {
        notepadContent = textarea.value;
        updateStats();

        showAutoSaveStatus('saving');

        if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
        }

        autoSaveTimeout = setTimeout(() => {
            saveNotepadContent();
            autoSaveTimeout = null;
        }, 1000);
    });
}

function resetNotepadSettings() {
    if (confirm('Сбросить настройки блокнота (размер шрифта)?')) {
        currentFontSize = 14;

        document.getElementById('fontSizeValue').textContent = currentFontSize;

        const textarea = document.getElementById('notepadText');
        textarea.style.fontSize = currentFontSize + 'px';

        saveData();

        showTooltip('Настройки блокнота сброшены', 2000);
    }
}

function updateStats() {
    const text = document.getElementById('notepadText').value;
    const chars = text.length;
    const lines = text.split('\n').length;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;

    document.querySelector('.char-count').textContent = chars;
    document.querySelector('.line-count').textContent = lines;
    document.querySelector('.word-count').textContent = words;
}

function showAutoSaveStatus(status) {
    const statusEl = document.getElementById('autoSaveStatus');
    statusEl.className = 'notepad-auto-save ' + status;

    switch (status) {
        case 'saving':
            statusEl.querySelector('span').textContent = 'Сохранение...';
            break;
        case 'saved':
            statusEl.querySelector('span').textContent = 'Сохранено';
            setTimeout(() => {
                statusEl.querySelector('span').textContent = 'Автосохранение включено';
                statusEl.className = 'notepad-auto-save';
            }, 2000);
            break;
        default:
            statusEl.querySelector('span').textContent = 'Автосохранение включено';
    }
}

function formatText(type) {
    const textarea = document.getElementById('notepadText');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);

    let formattedText = '';

    switch (type) {
        case 'bold':
            formattedText = `**${selectedText}**`;
            break;
        case 'italic':
            formattedText = `*${selectedText}*`;
            break;
        case 'underline':
            formattedText = `__${selectedText}__`;
            break;
        case 'list':
            if (selectedText) {
                const lines = selectedText.split('\n');
                formattedText = lines.map(line => `• ${line}`).join('\n');
            } else {
                formattedText = '• ';
            }
            break;
        case 'code':
            formattedText = '```\n' + selectedText + '\n```';
            break;
        case 'link':
            formattedText = `[${selectedText}](https://)`;
            break;
    }

    textarea.value = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);

    const newCursorPos = start + formattedText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();

    textarea.dispatchEvent(new Event('input'));
}

function clearNotepad() {
    if (confirm('Вы уверены, что хотите очистить блокнот? Это действие нельзя отменить.')) {
        notepadContent = '';
        document.getElementById('notepadText').value = '';
        localStorage.removeItem('roadmapNotepad');
        updateStats();
        showAutoSaveStatus('saved');
    }
}

function exportNotes() {
    const text = document.getElementById('notepadText').value;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ERBY_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showTooltip('Заметки экспортированы в TXT', 2000);
}

function changeFontSize(delta) {
    const newSize = currentFontSize + delta;

    if (newSize >= MIN_FONT_SIZE && newSize <= MAX_FONT_SIZE) {
        currentFontSize = newSize;

        document.getElementById('fontSizeValue').textContent = currentFontSize;

        const textarea = document.getElementById('notepadText');
        textarea.style.fontSize = currentFontSize + 'px';

        saveData();

        textarea.focus();
    }
}

function loadFontSize() {
    const savedData = localStorage.getItem('roadmapData');
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            if (data.notepadFontSize) {
                currentFontSize = data.notepadFontSize;
                document.getElementById('fontSizeValue').textContent = currentFontSize;
                document.getElementById('notepadText').style.fontSize = currentFontSize + 'px';
                return;
            }
        } catch (e) {
            console.error('Ошибка загрузки размера шрифта:', e);
        }
    }

    const savedSize = localStorage.getItem('notepadFontSize');
    if (savedSize) {
        const size = parseInt(savedSize, 10);
        if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) {
            currentFontSize = size;
            document.getElementById('fontSizeValue').textContent = currentFontSize;
            document.getElementById('notepadText').style.fontSize = currentFontSize + 'px';
        }
    }
}

init();