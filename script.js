let ctrlPressed = false;

document.addEventListener('keydown', function (e) {
    if (e.key === 'Control' || e.ctrlKey) {
        ctrlPressed = true;
        document.body.classList.add('ctrl-pressed');
    }
});

document.addEventListener('keyup', function (e) {
    if (e.key === 'Control' || (!e.ctrlKey && ctrlPressed)) {
        ctrlPressed = false;
        document.body.classList.remove('ctrl-pressed');
    }
});

window.addEventListener('blur', function () {
    ctrlPressed = false;
    document.body.classList.remove('ctrl-pressed');
});

let currentRoadmapId = 'default';
let isRoadmapsModalOpen = false;

function getStorageKey() {
    return `erby_roadmap_${currentRoadmapId}`;
}

function getRoadmapListKey() {
    return 'erby_roadmap_list';
}

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

let isCanvasDragging = false;
let canvasStartX = 0;
let canvasStartY = 0;
let canvasScrollLeft = 0;
let canvasScrollTop = 0;
let isTouchDevice = false;

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 32;

const APP_VERSION = '1.2.2';

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

function initRoadmapSystem() {
    // ВСЕГДА ИСПОЛЬЗУЕМ HASH
    if (window.location.hash && window.location.hash.startsWith('#/')) {
        currentRoadmapId = window.location.hash.substring(2);
        console.log('Loaded from hash:', currentRoadmapId);
    } else {
        currentRoadmapId = 'default';
        console.log('Default roadmap');
    }
    
    document.title = `ERBY: ${currentRoadmapId}`;
    loadRoadmapData();
    updateRoadmapList();
}

function loadRoadmapData() {
    const saved = localStorage.getItem(getStorageKey());
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
                if (isNotepadOpen) {
                    const editor = document.getElementById('notepadEditor');
                    if (editor) {
                        editor.innerHTML = notepadContent;
                    }
                }
            }

            if (data.notepadFontSize) {
                currentFontSize = data.notepadFontSize;
                const fontSizeValue = document.getElementById('fontSizeValue');
                if (fontSizeValue) {
                    fontSizeValue.textContent = currentFontSize;
                }
                const editor = document.getElementById('notepadEditor');
                if (editor) {
                    editor.style.fontSize = currentFontSize + 'px';
                }
            }

            return;
        } catch (e) {
            console.error('Ошибка загрузки данных:', e);
        }
    }

    // Для обратной совместимости
    const savedLegacy = localStorage.getItem('roadmapData');
    if (savedLegacy && currentRoadmapId === 'default') {
        try {
            const data = JSON.parse(savedLegacy);

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
            }

            saveData();

            localStorage.removeItem('roadmapData');
            localStorage.removeItem('roadmapNotepad');
            localStorage.removeItem('notepadFontSize');

            addToRoadmapList('default');
        } catch (e) {
            console.error('Ошибка миграции:', e);
        }
    }
}

// Загрузка legacy данных (для обратной совместимости)
function loadLegacyData() {
    const saved = localStorage.getItem('roadmapData');
    if (saved && currentRoadmapId === 'default') {
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
            }

            // Сохраняем в новый формат
            saveData();

            // Удаляем старые данные
            localStorage.removeItem('roadmapData');
            localStorage.removeItem('roadmapNotepad');
            localStorage.removeItem('notepadFontSize');

            // Добавляем в список roadmap'ов
            addToRoadmapList('default');

            showTooltip('Мигрированы старые данные в новый формат', 2000);
        } catch (e) {
            console.error('Ошибка миграции:', e);
        }
    }
}

function duplicateRoadmap(sourceId, targetId) {
    const data = localStorage.getItem(`erby_roadmap_${sourceId}`);
    if (data) {
        const parsed = JSON.parse(data);
        parsed.roadmapId = targetId;
        parsed.name = targetId;
        parsed.lastModified = new Date().toISOString();
        localStorage.setItem(`erby_roadmap_${targetId}`, JSON.stringify(parsed));
        addToRoadmapList(targetId);
        return true;
    }
    return false;
}

function renameRoadmap(oldId, newId) {
    if (oldId === newId) return false;

    const data = localStorage.getItem(`erby_roadmap_${oldId}`);
    if (!data) return false;

    const parsed = JSON.parse(data);
    parsed.roadmapId = newId;
    parsed.name = newId;

    localStorage.setItem(`erby_roadmap_${newId}`, JSON.stringify(parsed));
    localStorage.removeItem(`erby_roadmap_${oldId}`);

    // Обновляем список
    const listData = localStorage.getItem(getRoadmapListKey());
    if (listData) {
        const roadmaps = JSON.parse(listData);
        const index = roadmaps.findIndex(r => r.id === oldId);
        if (index !== -1) {
            roadmaps[index] = {
                id: newId,
                name: newId,
                lastModified: new Date().toISOString(),
                nodeCount: parsed.nodes.length,
                connectionCount: parsed.connections.length
            };
            localStorage.setItem(getRoadmapListKey(), JSON.stringify(roadmaps));
        }
    }

    return true;
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

function updateNotepadContent() {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    notepadContent = editor.innerHTML;
    updateStats();

    if (isNotepadOpen) {
        showAutoSaveStatus('saving');
    }

    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }

    autoSaveTimeout = setTimeout(() => {
        saveNotepadContent();
        autoSaveTimeout = null;
    }, 1000);
}

function applyColor(color) {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    const selection = window.getSelection();
    const savedSelection = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

    editor.focus();

    if (savedSelection) {
        selection.removeAllRanges();
        selection.addRange(savedSelection);
    }

    if (selection.isCollapsed || selection.toString().trim() === '') {
        showTooltip('Выделите текст для окрашивания', 1500);
        return;
    }

    try {
        document.execCommand('foreColor', false, color);
    } catch (e) {
        const selectedText = selection.toString();
        const span = document.createElement('span');
        span.style.color = color;
        span.textContent = selectedText;

        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(span);

        selection.removeAllRanges();
        const newRange = document.createRange();
        newRange.setStartAfter(span);
        newRange.collapse(true);
        selection.addRange(newRange);
    }

    updateNotepadContent();
    editor.focus();

    const colorName = getColorName(color);
    showTooltip(`Текст окрашен в ${colorName}`, 1500);
}

function getColorName(hex) {
    const colors = {
        '#ff6b6b': 'Красный',
        '#4caf50': 'Зеленый',
        '#ffd700': 'Желтый',
        '#2196f3': 'Синий',
        '#9c27b0': 'Фиолетовый',
        '#ff9800': 'Оранжевый',
        '#00bcd4': 'Бирюзовый',
        '#795548': 'Коричневый'
    };
    return colors[hex.toLowerCase()] || 'выбранный цвет';
}

function removeFormatting() {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    editor.focus();

    const selection = window.getSelection();
    if (selection.isCollapsed) {
        showTooltip('Выделите текст для очистки форматирования', 1500);
        return;
    }

    document.execCommand('removeFormat', false, null);

    updateNotepadContent();
    editor.focus();

    showTooltip('Форматирование удалено', 1500);
}

function setupNotepadLinkHandler() {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    editor.addEventListener('click', function (e) {
        if (e.target.tagName === 'A' && ctrlPressed) {
            const url = e.target.href;
            const target = e.target.target || '_blank';

            window.open(url, target);

            showTooltip('Ссылка открывается в новой вкладке', 1500);

            e.preventDefault();
            e.stopPropagation();
        }
    });

    // Также обрабатываем контекстное меню
    editor.addEventListener('contextmenu', function (e) {
        if (e.target.tagName === 'A') {
            // Показываем подсказку в контекстном меню
            if (!ctrlPressed) {
                showTooltip('Зажмите Ctrl для клика по ссылке', 1500);
                e.preventDefault();
            }
        }
    });
}

function insertLink() {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    editor.focus();

    const selection = window.getSelection();
    if (selection.isCollapsed) {
        showTooltip('Выделите текст для создания ссылки', 1500);
        return;
    }

    const url = prompt('Введите URL ссылки:', 'https://');
    if (url) {
        try {
            document.execCommand('createLink', false, url);
        } catch (e) {
            document.execCommand('insertHTML', false,
                `<a href="${url}" target="_blank">${selection.toString()}</a>`);
        }

        updateNotepadContent();
        editor.focus();

        showTooltip('Ссылка добавлена', 1500);
    }
}

function insertCode() {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    editor.focus();

    const selection = window.getSelection();
    if (selection.isCollapsed) {
        document.execCommand('insertHTML', false, '<code>код</code>&nbsp;');
    } else {
        document.execCommand('insertHTML', false,
            `<code>${selection.toString()}</code>`);
    }

    updateNotepadContent();
    editor.focus();
}

function setupNotepadAutosave() {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    let saveTimeout = null;

    const triggerSave = () => {
        updateNotepadContent();
    };

    editor.addEventListener('input', triggerSave);
    editor.addEventListener('keydown', triggerSave);
    editor.addEventListener('keyup', triggerSave);
    editor.addEventListener('paste', triggerSave);
    editor.addEventListener('cut', triggerSave);
    editor.addEventListener('change', triggerSave);

    editor.addEventListener('click', () => {
        setTimeout(triggerSave, 100);
    });

    editor.addEventListener('keydown', (e) => {
        if (e.ctrlKey) {
            switch (e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    setTimeout(() => formatText('bold'), 10);
                    break;
                case 'i':
                    e.preventDefault();
                    setTimeout(() => formatText('italic'), 10);
                    break;
                case 'u':
                    e.preventDefault();
                    setTimeout(() => formatText('underline'), 10);
                    break;
                case 's':
                case 'ы':
                    // Ctrl+S - зачёркивание в блокноте
                    if (document.activeElement === editor && !e.shiftKey) {
                        e.preventDefault();
                        setTimeout(() => formatText('strikethrough'), 10);
                        return;
                    }
                    break;
                case 'k':
                    e.preventDefault();
                    setTimeout(() => insertLink(), 10);
                    break;
            }
        }
    });

    const fontSizeControls = document.querySelectorAll('.font-size-btn');
    fontSizeControls.forEach(btn => {
        const originalClick = btn.onclick;
        if (originalClick) {
            btn.onclick = function () {
                originalClick.call(this);
                setTimeout(triggerSave, 100);
            };
        }
    });

    window.addEventListener('beforeunload', () => {
        saveNotepadContent();
    });

    setupNotepadLinkHandler();
}

function isMobileDevice() {
    const isTouchDevice = 'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0;

    const isSmallScreen = window.innerWidth <= 768 ||
        window.innerHeight <= 768;

    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

    return (isTouchDevice && isSmallScreen) || isMobileUserAgent;
}

function initCanvasDrag() {
    const canvas = document.getElementById('roadmapCanvas');

    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.style.msUserSelect = 'none';

    canvas.addEventListener('selectstart', function (e) {
        e.preventDefault();
        return false;
    });

    const mainArea = document.querySelector('.main-area');

    if (!canvas || !mainArea) return;

    isTouchDevice = 'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0;

    console.log('Touch устройство:', isTouchDevice ? 'Да' : 'Нет');

    if (!isTouchDevice) {
        console.log('Десктопное устройство, перетаскивание отключено');
        setupDesktopMode();
        return;
    }

    console.log('Touch устройство, настраиваем перетаскивание...');
    setupTouchMode();

    // ################### НАСТРОЙКА TOUCH РЕЖИМА ###################
    function setupTouchMode() {
        mainArea.style.overflow = 'auto';
        mainArea.style.webkitOverflowScrolling = 'touch';

        canvas.style.cursor = 'grab';
        canvas.style.touchAction = 'none';

        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

        canvas.addEventListener('mousedown', handleMouseDown);

        updateCanvasSize();

        addTouchHint();
    }

    function setupDesktopMode() {
        mainArea.style.overflow = 'hidden';
        canvas.style.cursor = 'default';

        console.log('Десктоп: контейнеры остаются на своих местах');
    }

    // ################### ОБРАБОТЧИКИ СОБЫТИЙ ###################
    function handleTouchStart(e) {
        if (e.target.closest('.node') || e.target.closest('.connection')) {
            return;
        }

        if (e.touches.length === 1) {
            e.preventDefault();
            isCanvasDragging = true;
            const touch = e.touches[0];
            canvasStartX = touch.clientX;
            canvasStartY = touch.clientY;
            canvasScrollLeft = mainArea.scrollLeft;
            canvasScrollTop = mainArea.scrollTop;

            canvas.style.cursor = 'grabbing';
        }
    }

    function handleTouchMove(e) {
        if (!isCanvasDragging || e.touches.length !== 1) return;

        e.preventDefault();
        const touch = e.touches[0];
        const deltaX = touch.clientX - canvasStartX;
        const deltaY = touch.clientY - canvasStartY;

        const newScrollLeft = canvasScrollLeft - deltaX;
        const newScrollTop = canvasScrollTop - deltaY;

        const maxScrollLeft = Math.max(0, canvas.scrollWidth - mainArea.clientWidth);
        const maxScrollTop = Math.max(0, canvas.scrollHeight - mainArea.clientHeight);

        mainArea.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScrollLeft));
        mainArea.scrollTop = Math.max(0, Math.min(newScrollTop, maxScrollTop));
    }

    function handleTouchEnd(e) {
        if (!isCanvasDragging) return;

        if (e.changedTouches && e.changedTouches[0]) {
            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - canvasStartX;
            const deltaY = touch.clientY - canvasStartY;

            applyInertia(deltaX * 0.3, deltaY * 0.3);
        }

        isCanvasDragging = false;
        canvas.style.cursor = 'grab';
    }

    function handleMouseDown(e) {
        if (e.target.closest('.node') || e.target.closest('.connection')) {
            return;
        }

        if (e.button === 0) {
            e.preventDefault();
            isCanvasDragging = true;
            canvasStartX = e.clientX;
            canvasStartY = e.clientY;
            canvasScrollLeft = mainArea.scrollLeft;
            canvasScrollTop = mainArea.scrollTop;

            canvas.style.cursor = 'grabbing';

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
    }

    function handleMouseMove(e) {
        if (!isCanvasDragging) return;

        e.preventDefault();
        const deltaX = e.clientX - canvasStartX;
        const deltaY = e.clientY - canvasStartY;

        const newScrollLeft = canvasScrollLeft - deltaX;
        const newScrollTop = canvasScrollTop - deltaY;

        const maxScrollLeft = Math.max(0, canvas.scrollWidth - mainArea.clientWidth);
        const maxScrollTop = Math.max(0, canvas.scrollHeight - mainArea.clientHeight);

        mainArea.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScrollLeft));
        mainArea.scrollTop = Math.max(0, Math.min(newScrollTop, maxScrollTop));
    }

    function handleMouseUp(e) {
        if (!isCanvasDragging) return;

        const deltaX = e.clientX - canvasStartX;
        const deltaY = e.clientY - canvasStartY;

        applyInertia(deltaX * 0.3, deltaY * 0.3);

        isCanvasDragging = false;
        canvas.style.cursor = 'grab';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }

    function applyInertia(velocityX, velocityY) {
        let momentumX = velocityX;
        let momentumY = velocityY;

        function applyMomentum() {
            if (Math.abs(momentumX) > 0.1 || Math.abs(momentumY) > 0.1) {
                const currentScrollLeft = mainArea.scrollLeft;
                const currentScrollTop = mainArea.scrollTop;

                const maxScrollLeft = Math.max(0, canvas.scrollWidth - mainArea.clientWidth);
                const maxScrollTop = Math.max(0, canvas.scrollHeight - mainArea.clientHeight);

                const newScrollLeft = Math.max(0, Math.min(currentScrollLeft - momentumX, maxScrollLeft));
                const newScrollTop = Math.max(0, Math.min(currentScrollTop - momentumY, maxScrollTop));

                mainArea.scrollLeft = newScrollLeft;
                mainArea.scrollTop = newScrollTop;

                momentumX *= 0.95;
                momentumY *= 0.95;

                requestAnimationFrame(applyMomentum);
            }
        }

        applyMomentum();
    }

    // ################### ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ###################
    function updateCanvasSize() {
        if (!isTouchDevice) return;

        let maxX = 0;
        let maxY = 0;

        nodes.forEach(node => {
            maxX = Math.max(maxX, node.x + 250);
            maxY = Math.max(maxY, node.y + 150);
        });

        canvas.style.minWidth = (maxX + 100) + 'px';
        canvas.style.minHeight = (maxY + 100) + 'px';
    }

    function addTouchHint() {
        const hint = document.createElement('div');
        hint.innerHTML = '👆 Перетащите экран для перемещения';
        hint.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.6);
            color: #ffd000;
            padding: 10px 15px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 1000;
            pointer-events: none;
            animation: fadeHint 5s ease-in-out forwards;
        `;

        document.head.insertAdjacentHTML('beforeend', `
            <style>
                @keyframes fadeHint {
                    0% { opacity: 0; transform: translateY(20px); }
                    15% { opacity: 1; transform: translateY(0); }
                    90% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(20px); }
                }
            </style>
        `);

        document.body.appendChild(hint);

        setTimeout(() => {
            if (hint.parentNode) {
                hint.parentNode.removeChild(hint);
            }
        }, 5000);
    }

    window.addEventListener('resize', updateCanvasSize);

    const originalRenderAll = window.renderAll;
    if (originalRenderAll) {
        window.renderAll = function () {
            originalRenderAll.apply(this, arguments);
            if (isTouchDevice) {
                setTimeout(updateCanvasSize, 50);
            }
        };
    }
}

function preventGlobalTextSelection() {
    // Блокируем выделение по Ctrl+A
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            const active = document.activeElement;
            const isNotepad = active.closest('.notepad-editor') ||
                active.id === 'notepadText';
            const isInput = active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA';

            // Если не блокнот и не поле ввода - блокируем
            if (!isNotepad && !isInput) {
                e.preventDefault();
                showTooltip('Выделение текста отключено', 1500);
                return false;
            }
        }
    });

    // Блокируем выделение мышью (кроме блокнота)
    document.addEventListener('mousedown', function (e) {
        const target = e.target;
        const isNotepad = target.closest('.notepad-editor') ||
            target.closest('.notepad-modal') ||
            target.id === 'notepadText';
        const isInput = target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA';

        // Если не блокнот и не поле ввода - отключаем выделение
        if (!isNotepad && !isInput) {
            // Позволяем только одиночный клик для узлов/связей
            if (e.detail > 1) { // Двойной/тройной клик
                e.preventDefault();
            }
        }
    }, true); // Используем capture phase

    // Блокируем контекстное меню (кроме блокнота)
    document.addEventListener('contextmenu', function (e) {
        const target = e.target;
        const isNotepad = target.closest('.notepad-editor') ||
            target.id === 'notepadText';

        if (!isNotepad) {
            // Для узлов у нас своё контекстное меню (блокировка)
            // Для остального - блокируем стандартное
            if (!target.closest('.node')) {
                e.preventDefault();
            }
        }
    });

    // Блокируем перетаскивание (drag-and-drop) изображений и ссылок
    document.addEventListener('dragstart', function (e) {
        if (!e.target.closest('.notepad-editor')) {
            e.preventDefault();
        }
    });
}

function init() {
    initRoadmapSystem();

    document.getElementById('versionPlaceholder').textContent = `v${APP_VERSION}`;

    window.addEventListener('hashchange', function () {
        initRoadmapSystem();
        renderAll();
    });

    renderAll();
    setupEventListeners();
    setupNotepadAutosave();
    setInterval(updateClock, 1000);
    updateClock();
    registerServiceWorker();
    initCanvasDrag();

    gridBackground = document.getElementById('gridBackground');

    checkAllNodesLocked();

    document.addEventListener('wheel', function (e) {
        if (e.deltaX !== 0) {
            e.preventDefault();
        }
    }, { passive: false });

    if (!localStorage.getItem('roadmapFirstRun')) {
        setTimeout(() => {
            if (confirm('Привет! Это ваш первый запуск ERBY. Теперь вы можете создавать несколько roadmap\'ов. Хотите посмотреть справку?')) {
                showHelp();
            }
        }, 1000);
        localStorage.setItem('roadmapFirstRun', 'true');
    }

    setTimeout(() => {
        const editor = document.getElementById('notepadEditor');
        if (editor) {
            editor.style.fontSize = currentFontSize + 'px';

            editor.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
                updateNotepadContent();
            });
        }
    }, 100);
}

function setupEventListeners() {
    canvas.addEventListener('click', canvasClick);
    canvas.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('resize', renderAll);

    document.addEventListener('click', (e) => {
        if (e.target === helpModal) closeHelp();
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
        node.progress.fill(0);
    } else if (isCurrentlyActive) {
        for (let i = 0; i < 12; i++) {
            node.progress[i] = i <= index ? 1 : 0;
        }
    } else {
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

        if (node.locked) {
            nodeEl.classList.add('locked');
            nodeEl.style.cursor = 'default';
        }

        if (selectedNode && selectedNode.id === node.id && mouseIsDown) {
            nodeEl.style.zIndex = '205';
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
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    } else if (document.selection) {
        document.selection.empty();
    }

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

    nodeEl.style.zIndex = '100';
    nodeEl.style.boxShadow = '0 0 0 2px #ffd000, 0 4px 16px rgba(0, 0, 0, 0.4)';

    highlightNodeConnections(node.id, true);
}

function drag(e) {
    if (!selectedNode || !mouseIsDown) return;

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
                case 'и':
                    e.preventDefault();
                    formatText('bold');
                    break;
                case 'i':
                case 'ш':
                    e.preventDefault();
                    formatText('italic');
                    break;
                case 'u':
                case 'г':
                    e.preventDefault();
                    formatText('underline');
                    break;
                case 's':
                case 'ы':
                    e.preventDefault();
                    saveNotepadContent();
                    showTooltip('Заметки сохранены', 1500);
                    break;
                case 'k':
                case 'л':
                    e.preventDefault();
                    insertLink();
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

    if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        e.preventDefault();
        toggleRoadmapsModal();
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
    if (isNotepadOpen) {
        const editor = document.getElementById('notepadEditor');
        if (editor) {
            notepadContent = editor.innerHTML;
        }
    }

    const data = {
        nodes,
        connections,
        notepad: notepadContent,
        notepadFontSize: currentFontSize,
        version: APP_VERSION,
        lastModified: new Date().toISOString(),
        name: currentRoadmapId
    };

    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(data));
        addToRoadmapList(currentRoadmapId);
        updateRoadmapList();
    } catch (e) {
        console.error('Ошибка сохранения:', e);
    }
}

// Добавление roadmap'а в список
function addToRoadmapList(roadmapId) {
    try {
        const listData = localStorage.getItem(getRoadmapListKey());
        let roadmaps = [];

        if (listData) {
            roadmaps = JSON.parse(listData);
        }

        const existingIndex = roadmaps.findIndex(r => r.id === roadmapId);
        const roadmapInfo = {
            id: roadmapId,
            name: roadmapId,
            lastModified: new Date().toISOString(),
            nodeCount: nodes.length,
            connectionCount: connections.length
        };

        if (existingIndex !== -1) {
            roadmaps[existingIndex] = roadmapInfo;
        } else {
            roadmaps.push(roadmapInfo);
        }

        roadmaps.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        localStorage.setItem(getRoadmapListKey(), JSON.stringify(roadmaps));
    } catch (e) {
        console.error('Ошибка сохранения списка:', e);
    }
}

// Обновление списка roadmap'ов в интерфейсе
function updateRoadmapList() {
    const roadmapListElement = document.getElementById('roadmapList');
    const roadmapCountElement = document.getElementById('roadmapCount');
    const currentRoadmapDisplay = document.getElementById('currentRoadmapDisplay');

    if (!roadmapListElement) return;

    try {
        const listData = localStorage.getItem(getRoadmapListKey());
        let roadmaps = [];

        if (listData) {
            roadmaps = JSON.parse(listData);
        }

        // Обновляем отображение текущего roadmap
        if (currentRoadmapDisplay) {
            currentRoadmapDisplay.textContent = currentRoadmapId;
        }

        // Обновляем счетчик
        if (roadmapCountElement) {
            const total = roadmaps.length;
            const active = roadmaps.find(r => r.id === currentRoadmapId) ? 1 : 0;
            roadmapCountElement.textContent = `${total} roadmap'ов • ${active} активен`;
        }

        let html = '';

        if (roadmaps.length === 0) {
            html = `
                <div style="text-align: center; padding: 40px 20px; color: #888;">
                    <i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 15px; opacity: 0.5;"></i>
                    <div style="font-size: 16px; margin-bottom: 5px;">Нет сохраненных roadmap</div>
                    <div style="font-size: 13px;">Создайте первый через поле выше</div>
                </div>
            `;
        } else {
            // ПОКАЗЫВАЕМ ВСЕ roadmap'ы (максимум 50 для безопасности)
            const maxToShow = 50;
            const roadmapsToShow = roadmaps.slice(0, maxToShow);

            // Разделяем на активный и остальные
            const currentRoadmap = roadmaps.find(r => r.id === currentRoadmapId);
            const otherRoadmaps = roadmaps.filter(r => r.id !== currentRoadmapId);

            // Сначала показываем текущий активный (если есть в списке)
            if (currentRoadmap) {
                html += createRoadmapItem(currentRoadmap, true);
            }

            // Затем остальные
            otherRoadmaps.forEach(roadmap => {
                html += createRoadmapItem(roadmap, false);
            });

            // Если roadmap'ов больше, чем показываем
            if (roadmaps.length > maxToShow) {
                html += `
                    <div style="text-align: center; padding: 15px; color: #888; font-size: 13px; border-top: 1px solid #444; margin-top: 10px;">
                        <i class="fas fa-ellipsis-h"></i>
                        Показаны ${maxToShow} из ${roadmaps.length} roadmap'ов
                    </div>
                `;
            }
        }

        roadmapListElement.innerHTML = html;

        // Обновляем высоту контейнера в зависимости от количества элементов
        const itemCount = roadmaps.length;
        const maxHeight = Math.min(400, 100 + (itemCount * 70)); // Максимум 400px
        roadmapListElement.style.maxHeight = maxHeight + 'px';

    } catch (e) {
        console.error('Ошибка обновления списка:', e);
        roadmapListElement.innerHTML = `
            <div style="color: #f44336; padding: 30px; text-align: center;">
                <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 10px;"></i>
                <div>Ошибка загрузки списка</div>
                <div style="font-size: 12px; margin-top: 5px;">Попробуйте обновить страницу</div>
            </div>
        `;
    }
}

// Функция для пересчёта статистики всех roadmap'ов
function recalculateAllRoadmapStats() {
    try {
        const listData = localStorage.getItem(getRoadmapListKey());
        if (!listData) return;

        const roadmaps = JSON.parse(listData);
        let updatedCount = 0;

        roadmaps.forEach(roadmap => {
            const roadmapData = localStorage.getItem(`erby_roadmap_${roadmap.id}`);
            if (roadmapData) {
                try {
                    const data = JSON.parse(roadmapData);
                    const nodeCount = data.nodes ? data.nodes.length : 0;
                    const connectionCount = data.connections ? data.connections.length : 0;

                    // Если статистика не совпадает, обновляем
                    if (roadmap.nodeCount !== nodeCount || roadmap.connectionCount !== connectionCount) {
                        roadmap.nodeCount = nodeCount;
                        roadmap.connectionCount = connectionCount;
                        updatedCount++;
                    }
                } catch (e) {
                    console.error(`Ошибка обработки roadmap ${roadmap.id}:`, e);
                }
            }
        });

        // Сохраняем обновлённый список
        localStorage.setItem(getRoadmapListKey(), JSON.stringify(roadmaps));

        if (updatedCount > 0) {
            console.log(`Обновлена статистика для ${updatedCount} roadmap'ов`);
        }

        return updatedCount;
    } catch (e) {
        console.error('Ошибка пересчёта статистики:', e);
        return 0;
    }
}

// Вспомогательная функция для создания элемента roadmap
function createRoadmapItem(roadmap, isCurrent) {
    const date = new Date(roadmap.lastModified);
    const timeAgo = getTimeAgo(date);
    const dateFormatted = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const nodeText = getPluralForm(roadmap.nodeCount, 'окошко', 'окошка', 'окошек');
    const connText = getPluralForm(roadmap.connectionCount, 'связь', 'связи', 'связей');

    // Определяем иконку по имени
    let icon = 'fas fa-map';
    if (roadmap.name.toLowerCase().includes('project') || roadmap.name.toLowerCase().includes('проект')) {
        icon = 'fas fa-project-diagram';
    } else if (roadmap.name.toLowerCase().includes('work') || roadmap.name.toLowerCase().includes('работа')) {
        icon = 'fas fa-briefcase';
    } else if (roadmap.name.toLowerCase().includes('study') || roadmap.name.toLowerCase().includes('учеба')) {
        icon = 'fas fa-graduation-cap';
    } else if (roadmap.name.toLowerCase().includes('personal') || roadmap.name.toLowerCase().includes('личный')) {
        icon = 'fas fa-user';
    }

    return `
        <div style="margin-bottom: 8px; padding: 12px; border-radius: 6px; background: ${isCurrent ? 'rgba(57, 73, 171, 0.3)' : 'rgba(255, 255, 255, 0.05)'}; border-left: 4px solid ${isCurrent ? '#ffd000' : '#51b448'}; transition: all 0.2s;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                        <i class="${icon}" style="color: ${isCurrent ? '#ffd000' : '#7986cb'}; margin-right: 10px; font-size: 14px;"></i>
                        <a href="javascript:void(0)" 
                           onclick="switchRoadmap('${roadmap.id}')"
                           style="color: ${isCurrent ? '#ffd000' : '#ddd'}; text-decoration: none; font-weight: ${isCurrent ? 'bold' : 'normal'}; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                           title="${roadmap.name}">
                            ${roadmap.name}
                        </a>
                        ${isCurrent ? `
                            <span style="color: #ffd000; margin-left: 10px; font-size: 11px; background: rgba(255, 208, 0, 0.2); padding: 2px 8px; border-radius: 10px; white-space: nowrap;">
                                <i class="fas fa-check"></i> активен
                            </span>
                        ` : ''}
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #888;">
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            <span title="${dateFormatted}">
                                <i class="far fa-clock" style="margin-right: 3px;"></i>
                                ${timeAgo}
                            </span>
                            <span title="Статистика">
                                <i class="fas fa-cube" style="margin-right: 3px;"></i>
                                ${roadmap.nodeCount} ${nodeText}
                            </span>
                            <span title="Связи">
                                <i class="fas fa-project-diagram" style="margin-right: 3px;"></i>
                                ${roadmap.connectionCount} ${connText}
                            </span>
                        </div>
                        
                        ${!isCurrent ? `
                            <button onclick="deleteRoadmap('${roadmap.id}')" 
                                    style="background: transparent; color: #ff6b6b; border: 1px solid rgba(211, 47, 47, 0.3); padding: 10px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 10px; transition: all 0.2s;"
                                    title="Удалить '${roadmap.id}'?"
                                    onmouseover="this.style.background='rgba(211, 47, 47, 0.2)'; this.style.borderColor='#ff6b6b'"
                                    onmouseout="this.style.background='transparent'; this.style.borderColor='rgba(211, 47, 47, 0.3)'">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : `
                            <span style="color: #888; font-size: 11px;">
                                <i class="fas fa-lock"></i> нельзя удалить
                            </span>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Функция для форматирования времени ("2 часа назад", "вчера" и т.д.)
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    if (diffDays === 1) return 'вчера';
    if (diffDays === 2) return 'позавчера';
    if (diffDays < 7) return `${diffDays} дн. назад`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} мес. назад`;
    return `${Math.floor(diffDays / 365)} г. назад`;
}

// Функция для правильного склонения слов
function getPluralForm(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;

    if (n > 10 && n < 20) return many;
    if (n1 === 1) return one;
    if (n1 >= 2 && n1 <= 4) return few;
    return many;
}

function toggleRoadmapsModal() {
    isRoadmapsModalOpen = !isRoadmapsModalOpen;
    const modal = document.getElementById('roadmapsModal');

    if (modal) {
        modal.style.display = isRoadmapsModalOpen ? 'flex' : 'none';
        isModalOpen = isRoadmapsModalOpen;

        if (isRoadmapsModalOpen) {
            const input = document.getElementById('roadmapIdInput');
            if (input) {
                input.value = '';
                input.focus();
            }

            recalculateAllRoadmapStats();

            updateRoadmapList();
        }
    }
}

// Переключение на другой roadmap
function switchRoadmap(roadmapId) {
    if (roadmapId === currentRoadmapId) return;
    
    if (confirm(`Перейти к roadmap "${roadmapId}"?`)) {
        saveData();
        if (roadmapId === 'default') {
            window.location.hash = '';
        } else {
            window.location.hash = '/' + roadmapId;
        }
    }
}

// Создание нового roadmap'а
function createNewRoadmap() {
    const roadmapId = prompt('Введите ID для нового roadmap (только буквы, цифры и дефисы):', `roadmap_${Date.now().toString().slice(-6)}`);

    if (!roadmapId) return;

    if (!/^[a-zA-Z0-9_-]+$/.test(roadmapId)) {
        alert('ID может содержать только буквы, цифры, дефисы и подчеркивания');
        return;
    }

    saveData();

    const newRoadmapData = {
        nodes: [],
        connections: [],
        notepad: '',
        notepadFontSize: 14,
        version: APP_VERSION,
        lastModified: new Date().toISOString(),
        name: roadmapId
    };

    localStorage.setItem(`erby_roadmap_${roadmapId}`, JSON.stringify(newRoadmapData));
    addToRoadmapList(roadmapId);

    window.location.hash = '/' + roadmapId;
}

function goToRoadmap() {
    const input = document.getElementById('roadmapIdInput');
    const roadmapId = input.value.trim();

    if (!roadmapId) {
        alert('Введите ID roadmap');
        return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(roadmapId)) {
        alert('ID может содержать только буквы, цифры, дефисы и подчеркивания');
        return;
    }

    const exists = localStorage.getItem(`erby_roadmap_${roadmapId}`) !== null;

    if (!exists && !confirm(`Roadmap "${roadmapId}" не существует. Создать новый?`)) {
        return;
    }

    if (!exists) {
        const newRoadmapData = {
            nodes: [],
            connections: [],
            notepad: '',
            notepadFontSize: 14,
            version: APP_VERSION,
            lastModified: new Date().toISOString(),
            name: roadmapId
        };
        localStorage.setItem(`erby_roadmap_${roadmapId}`, JSON.stringify(newRoadmapData));
        addToRoadmapList(roadmapId);
    }

    saveData();
    window.location.hash = '/' + roadmapId;
}

function exportData() {
    if (isNotepadOpen) {
        const editor = document.getElementById('notepadEditor');
        if (editor) {
            notepadContent = editor.innerHTML;
        }
    }

    const data = {
        nodes,
        connections,
        notepad: notepadContent,
        notepadFontSize: currentFontSize,
        version: APP_VERSION,
        exportDate: new Date().toISOString(),
        roadmapId: currentRoadmapId,
        roadmapName: currentRoadmapId
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ERBY_${currentRoadmapId}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showTooltip(`Roadmap "${currentRoadmapId}" экспортирован`, 2000);
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

                if (isNotepadOpen) {
                    const editor = document.getElementById('notepadEditor');
                    if (editor) {
                        editor.innerHTML = notepadContent;
                    }
                }
            } else {
                const oldNotepad = localStorage.getItem('roadmapNotepad');
                if (oldNotepad) {
                    notepadContent = oldNotepad;
                }
            }

            if (data.notepadFontSize) {
                currentFontSize = data.notepadFontSize;
                localStorage.setItem('notepadFontSize', currentFontSize.toString());

                const fontSizeValue = document.getElementById('fontSizeValue');
                if (fontSizeValue) {
                    fontSizeValue.textContent = currentFontSize;
                }

                const editor = document.getElementById('notepadEditor');
                if (editor) {
                    editor.style.fontSize = currentFontSize + 'px';
                }
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
            showTooltip('Ошибка загрузки данных', 3000);
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
                const fileRoadmapId = data.roadmapId || `imported_${Date.now().toString().slice(-6)}`;

                if (confirm(`Загрузить как новый roadmap "${fileRoadmapId}"?`)) {
                    localStorage.setItem(`erby_roadmap_${fileRoadmapId}`, JSON.stringify(data));
                    addToRoadmapList(fileRoadmapId);
                    window.location.href = `https://somenmi.github.io/ERBY/${fileRoadmapId}`;
                } else {
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
                        if (isNotepadOpen) {
                            const editor = document.getElementById('notepadEditor');
                            if (editor) {
                                editor.innerHTML = notepadContent;
                                updateStats();
                            }
                        }
                    }

                    if (data.notepadFontSize) {
                        currentFontSize = data.notepadFontSize;
                        const fontSizeValue = document.getElementById('fontSizeValue');
                        if (fontSizeValue) {
                            fontSizeValue.textContent = currentFontSize;
                        }

                        const editor = document.getElementById('notepadEditor');
                        if (editor) {
                            editor.style.fontSize = currentFontSize + 'px';
                        }
                    }

                    saveData();

                    if (isNotepadOpen) {
                        updateStats();
                    }

                    renderAll();
                    showTooltip('Данные загружены из файла', 2000);
                }
            } catch (error) {
                showTooltip('Ошибка загрузки файла', 3000);
                console.error(error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function deleteRoadmap(roadmapId) {
    // Нельзя удалить текущий активный roadmap
    if (roadmapId === currentRoadmapId) {
        alert('Нельзя удалить активный roadmap. Переключитесь на другой roadmap сначала.');
        return;
    }

    if (!confirm(`Вы уверены, что хотите удалить roadmap "${roadmapId}"? Это действие нельзя отменить.`)) {
        return;
    }

    try {
        // Удаляем данные roadmap
        localStorage.removeItem(`erby_roadmap_${roadmapId}`);

        // Удаляем из списка
        const listData = localStorage.getItem(getRoadmapListKey());
        if (listData) {
            const roadmaps = JSON.parse(listData);
            const updatedRoadmaps = roadmaps.filter(r => r.id !== roadmapId);
            localStorage.setItem(getRoadmapListKey(), JSON.stringify(updatedRoadmaps));
        }

        // Обновляем отображение
        updateRoadmapList();

        showTooltip(`Roadmap "${roadmapId}" удалён`, 2000);
    } catch (e) {
        console.error('Ошибка удаления roadmap:', e);
        alert('Ошибка при удалении roadmap');
    }
}

function exportData() {
    if (isNotepadOpen) {
        const textarea = document.getElementById('notepadText');
        notepadContent = textarea.value;
    }

    const data = {
        nodes,
        connections,
        notepad: notepadContent,
        notepadFontSize: currentFontSize,
        version: APP_VERSION,
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
    tooltip.style.zIndex = '9999';

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
    const editor = document.getElementById('notepadEditor');

    if (!editor) return;

    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.notepad) {
                notepadContent = data.notepad;
                editor.innerHTML = notepadContent;

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
        editor.innerHTML = notepadContent;
    } else {
        notepadContent = '';
        editor.innerHTML = '';
    }

    loadFontSize();
    updateStats();
}

function saveNotepadContent() {
    if (isNotepadOpen) {
        const editor = document.getElementById('notepadEditor');
        if (editor) {
            notepadContent = editor.innerHTML;

            const saved = localStorage.getItem('roadmapData');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    data.notepad = notepadContent;
                    data.notepadFontSize = currentFontSize;
                    localStorage.setItem('roadmapData', JSON.stringify(data));
                } catch (e) {
                    console.error('Ошибка сохранения блокнота:', e);
                }
            } else {
                const data = {
                    nodes: [],
                    connections: [],
                    notepad: notepadContent,
                    notepadFontSize: currentFontSize,
                    version: APP_VERSION
                };
                localStorage.setItem('roadmapData', JSON.stringify(data));
            }

            localStorage.setItem('roadmapNotepad', notepadContent);
            localStorage.setItem('notepadFontSize', currentFontSize.toString());

            showAutoSaveStatus('saved');
        }
    }
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
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    const text = editor.textContent || editor.innerText;

    const chars = text.length;
    const lines = text.split('\n').length;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;

    document.querySelector('.char-count').textContent = chars;
    document.querySelector('.line-count').textContent = lines;
    document.querySelector('.word-count').textContent = words;
}

function showAutoSaveStatus(status) {
    const statusEl = document.getElementById('autoSaveStatus');
    if (!statusEl) return;

    statusEl.className = 'notepad-auto-save ' + status;

    switch (status) {
        case 'saving':
            statusEl.querySelector('span').textContent = 'Сохранение...';
            break;
        case 'saved':
            statusEl.querySelector('span').textContent = 'Сохранено';
            setTimeout(() => {
                if (statusEl) {
                    statusEl.querySelector('span').textContent = 'Автосохранение включено';
                    statusEl.className = 'notepad-auto-save';
                }
            }, 2000);
            break;
        default:
            if (statusEl.querySelector('span')) {
                statusEl.querySelector('span').textContent = 'Автосохранение включено';
            }
    }
}

function formatText(type) {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    if (document.activeElement !== editor) {
        editor.focus();
    }

    try {
        switch (type) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'italic':
                document.execCommand('italic', false, null);
                break;
            case 'underline':
                document.execCommand('underline', false, null);
                break;
            case 'strikethrough':
                document.execCommand('strikeThrough', false, null);
                break;
            case 'list':
                document.execCommand('insertUnorderedList', false, null);
                break;
        }
    } catch (e) {
        console.error('Ошибка форматирования:', e);

        if (type === 'strikethrough') {
            applyStrikethroughFallback();
        }
    }

    updateNotepadContent();
    editor.focus();
}

// Резервная функция для зачёркнутого текста (если execCommand не работает)
function applyStrikethroughFallback() {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    editor.focus();

    const selection = window.getSelection();
    if (selection.isCollapsed) {
        showTooltip('Выделите текст для зачёркивания', 1500);
        return;
    }

    const selectedText = selection.toString();
    const span = document.createElement('span');
    span.style.textDecoration = 'line-through';
    span.textContent = selectedText;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(span);

    // Восстанавливаем курсор после вставки
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    selection.addRange(newRange);

    showTooltip('Текст зачёркнут', 1500);
}

function clearNotepad() {
    if (confirm('Вы уверены, что хотите очистить блокнот? Это действие нельзя отменить.')) {
        notepadContent = '';
        const editor = document.getElementById('notepadEditor');
        if (editor) editor.innerHTML = '';
        localStorage.removeItem('roadmapNotepad');
        updateStats();
        updateNotepadContent();
        showAutoSaveStatus('saved');
    }
}

function exportNotes() {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    let htmlContent = editor.innerHTML;

    htmlContent = htmlContent
        .replace(/<div><\/div>/g, '')
        .replace(/<div><br><\/div>/g, '<br>')
        .replace(/<div>(.+?)<\/div>/g, '<br>$1')
        .replace(/ {2,}/g, function (match) {
            return '&nbsp;'.repeat(match.length);
        });

    htmlContent = htmlContent.trim();

    const cleanHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Заметки из ERBY</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; padding: 20px; background: #383838; color: #ffffff; }
        .content { max-width: 800px; margin: 0 auto; background: #474747; padding: 30px; border: 24px double #383838; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 2px solid #e4a700; }
        .date { color: #e4a700; font-size: 14px; }
        h1 { color: #f0f0f0; }
        code { background: rgba(0, 0, 0, 0.3); padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; color: #ffd700; }
        a { color: #64b5f6; text-decoration: underline; }
        span[style*="color"] { color: inherit !important; }
        b, strong { font-weight: bold; }
        i, em { font-style: italic; }
        u { text-decoration: underline; }
        ul { padding-left: 20px; }
        .exported-content { white-space: pre-wrap; font-size: ${currentFontSize}px; }
    </style>
</head>
<body>
    <div class="content">
        <div class="header">
            <h1>Заметки из ERBY</h1>
            <div class="date">Экспорт от ${new Date().toLocaleString()}</div>
        </div>
        <div class="exported-content">${htmlContent}</div>
    </div>
</body>
</html>`;

    const blob = new Blob([cleanHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ERBY_notes_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showTooltip('Заметки экспортированы в HTML', 2000);
}

function changeFontSize(delta) {
    const editor = document.getElementById('notepadEditor');
    if (!editor) return;

    const newSize = currentFontSize + delta;

    if (newSize >= MIN_FONT_SIZE && newSize <= MAX_FONT_SIZE) {
        currentFontSize = newSize;

        document.getElementById('fontSizeValue').textContent = currentFontSize;
        editor.style.fontSize = currentFontSize + 'px';

        saveData();
        editor.focus();
    }
}

function loadFontSize() {
    const savedData = localStorage.getItem('roadmapData');
    const editor = document.getElementById('notepadEditor');

    if (!editor) return;

    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            if (data.notepadFontSize) {
                currentFontSize = data.notepadFontSize;
                document.getElementById('fontSizeValue').textContent = currentFontSize;
                editor.style.fontSize = currentFontSize + 'px';
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
            editor.style.fontSize = currentFontSize + 'px';
        }
    }
}

init();