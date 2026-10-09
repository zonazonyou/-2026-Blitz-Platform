/* ============================================================
   ФОНКОД BLITZ 2026 — Полная платформа блиц-турниров
   Аккаунты · Блицы · Приглашения · Гонка · Реалтайм
   ============================================================ */

/* ==================== UTILS ==================== */
const $ = (id) => document.getElementById(id);
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}
async function hashPassword(pw) {
    const data = new TextEncoder().encode(pw + '|foncode_blitz_2026');
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function genId() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
function playerColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${h}, 75%, 55%)`;
}

/* ==================== STORAGE LAYER ==================== */
const Storage = {
    USERS_KEY: 'foncode_users',
    BLITZES_KEY: 'foncode_blitzes',
    SESSION_KEY: 'foncode_session',

    getUsers() {
        try { return JSON.parse(localStorage.getItem(this.USERS_KEY) || '{}'); }
        catch (e) { return {}; }
    },
    saveUsers(users) { localStorage.setItem(this.USERS_KEY, JSON.stringify(users)); },

    getBlitzes() {
        try { return JSON.parse(localStorage.getItem(this.BLITZES_KEY) || '{}'); }
        catch (e) { return {}; }
    },
    saveBlitzes(blitzes) { localStorage.setItem(this.BLITZES_KEY, JSON.stringify(blitzes)); },
    getBlitz(id) { return this.getBlitzes()[id] || null; },
    saveBlitz(blitz) {
        const all = this.getBlitzes();
        all[blitz.id] = blitz;
        this.saveBlitzes(all);
    },
    deleteBlitz(id) {
        const all = this.getBlitzes();
        delete all[id];
        this.saveBlitzes(all);
    },

    getSession() {
        try { return JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    },
    saveSession(user) { localStorage.setItem(this.SESSION_KEY, JSON.stringify(user)); },
    clearSession() { localStorage.removeItem(this.SESSION_KEY); }
};

/* ==================== STATE ==================== */
const state = {
    currentUser: null,          // { username }
    currentBlitzId: null,
    blitzTab: 'participants',   // participants | match | spectator | admin
    isAuthRegisterMode: false,
    editor: null,
    codeCache: { python: '', cpp: '' },
    activeProblemIdx: 0,
    tickInterval: null
};

/* ==================== BROADCAST CHANNEL ==================== */
const channel = ('BroadcastChannel' in window)
    ? new BroadcastChannel('foncode_blitz_sync')
    : null;

function broadcast(type, payload = {}) {
    if (channel) channel.postMessage({ type, payload });
}

/* ==================== DEMO TASKS ==================== */
const TASK_POOL = [
    { id:'A', name:'Максимальный подмассив', desc:'Найдите максимальную сумму подмассива.\n\n**Ввод:** $N$ и массив из $N$ чисел ($1 \\le N \\le 10^5$).\n\n**Пример:**\n```\n5\n-2 1 -3 4 -1\n```\n**Вывод:** `4`' },
    { id:'B', name:'Палиндром', desc:'Проверьте, является ли строка палиндромом, игнорируя регистр и не-буквенные символы.\n\n**Пример:** `A man, a plan, a canal: Panama` → `true`' },
    { id:'C', name:'Сумма на отрезке', desc:'Постройте префиксные суммы и отвечайте на $Q$ запросов суммы на отрезке $[l, r]$ за $O(1)$.' },
    { id:'D', name:'LCA в дереве', desc:'Найдите наименьшего общего предка двух вершин дерева. Бинарные подъёмы, $O(\\log N)$.' },
    { id:'E', name:'Битовая маска', desc:'Задача коммивояжёра. ДП по битовым маскам, $O(2^n \\cdot n^2)$.' },
    { id:'F', name:'Дейкстра', desc:'Кратчайшее расстояние от вершины 1 до N во взвешенном графе. Приоритетная очередь.' },
    { id:'G', name:'Хеширование', desc:'Полиномиальный хеш строки. Проверка равенства подстрок за $O(1)$.' }
];

const PY_TEMPLATE = [
'def solve():',
'    import sys',
'    data = sys.stdin.read().split()',
'    if not data: return',
'    n = int(data[0])',
'    arr = list(map(int, data[1:1+n]))',
'    ',
'    # Ваше решение',
'    print(n)',
'',
'solve()'
].join('\n');

const CPP_TEMPLATE = [
'#include <bits/stdc++.h>',
'using namespace std;',
'',
'int main() {',
'    ios_base::sync_with_stdio(false);',
'    cin.tie(nullptr);',
'    ',
'    // Ваше решение',
'    return 0;',
'}'
].join('\n');

/* ==================== INIT ==================== */
document.addEventListener('DOMContentLoaded', () => {
    // Восстановление сессии
    const session = Storage.getSession();
    if (session) state.currentUser = session;

    // Обработка ?join=xxx
    const params = new URLSearchParams(location.search);
    const joinId = params.get('join');

    updateHeaderAuth();
    renderHome();

    if (joinId) {
        handleJoinLink(joinId);
    }

    // Синхронизация между вкладками
    if (channel) {
        channel.onmessage = (e) => {
            const { type } = e.data || {};
            if (type === 'BLITZ_UPDATED' || type === 'BLITZ_CREATED' || type === 'BLITZ_DELETED') {
                if (state.currentBlitzId) {
                    renderBlitz();
                } else {
                    renderHome();
                }
            }
        };
    }

    // Кросс-таб синхронизация через storage event
    window.addEventListener('storage', (e) => {
        if (e.key === Storage.BLITZES_KEY) {
            if (state.currentBlitzId) renderBlitz();
            else renderHome();
        }
    });

    // Горячие клавиши
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && state.currentBlitzId) {
            e.preventDefault();
            submitSolution();
        }
    });

    // Тик таймера для текущего блица
    state.tickInterval = setInterval(() => {
        if (state.currentBlitzId && state.blitzTab === 'spectator') {
            const blitz = Storage.getBlitz(state.currentBlitzId);
            if (blitz && blitz.status === 'active' && !blitz.pausedAt) {
                renderSpectatorTab(blitz);
            }
        }
    }, 1000);
});

/* ==================== ROUTING ==================== */
function switchScreen(id) {
    document.querySelectorAll('.view-screen').forEach(el => el.classList.remove('active'));
    $(id).classList.add('active');
}

function goHome() {
    state.currentBlitzId = null;
    state.blitzTab = 'participants';
    history.replaceState(null, '', location.pathname);
    renderHome();
    switchScreen('view-home');
}

function showCreate() {
    if (!state.currentUser) {
        showToast('Войдите, чтобы создать блиц');
        return openAuthModal('login');
    }
    switchScreen('view-create');
}

function openBlitz(id, tab = 'participants') {
    const blitz = Storage.getBlitz(id);
    if (!blitz) {
        showToast('Блиц не найден');
        return goHome();
    }
    state.currentBlitzId = id;
    state.blitzTab = tab;
    state.activeProblemIdx = 0;
    renderBlitz();
    switchScreen('view-blitz');
}

/* ==================== HOME ==================== */
function renderHome() {
    const blitzes = Storage.getBlitzes();
    const list = Object.values(blitzes).sort((a, b) => b.createdAt - a.createdAt);

    // Кнопка "Создать" в шапке — только для авторизованных
    $('nav-create').style.display = state.currentUser ? 'flex' : 'none';

    if (list.length === 0) {
        $('empty-blitzes').style.display = 'block';
        $('blitz-list-wrap').style.display = 'none';
        $('empty-blitzes').querySelector('button').style.display = state.currentUser ? 'inline-flex' : 'none';
        return;
    }

    $('empty-blitzes').style.display = 'none';
    $('blitz-list-wrap').style.display = 'block';

    $('blitz-list').innerHTML = list.map(b => `
        <div class="blitz-card" onclick="openBlitz('${b.id}')">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
                <h3>${escapeHtml(b.title)}</h3>
                <span class="status-badge status-${b.status}">${statusLabel(b.status)}</span>
            </div>
            <div class="meta">
                <span><i class="fa-solid fa-users"></i> ${b.participants.length} / ${b.maxPlayers}</span>
                <span><i class="fa-solid fa-list-check"></i> ${b.problems.length} задач</span>
                <span><i class="fa-solid fa-clock"></i> ${Math.round(b.durationSeconds / 60)} мин</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted);">
                Организатор: ${escapeHtml(b.owner)}
            </div>
        </div>
    `).join('');
}

function statusLabel(s) {
    return { registration: 'Регистрация', active: 'Идёт', finished: 'Завершён' }[s] || s;
}

/* ==================== AUTH ==================== */
function openAuthModal(mode = 'login') {
    state.isAuthRegisterMode = (mode === 'register');
    $('auth-modal').classList.add('active');
    $('modal-title').innerText = state.isAuthRegisterMode ? 'Регистрация' : 'Вход';
    $('auth-submit-btn').innerText = state.isAuthRegisterMode ? 'Создать аккаунт' : 'Войти';
    $('auth-switch-text').innerText = state.isAuthRegisterMode ? 'Уже есть аккаунт?' : 'Нет аккаунта?';
    $('auth-switch-link').innerText = state.isAuthRegisterMode ? 'Войти' : 'Зарегистрироваться';
}

function closeAuthModal() {
    $('auth-modal').classList.remove('active');
    $('auth-form').reset();
}

function toggleAuthMode(e) {
    e.preventDefault();
    openAuthModal(state.isAuthRegisterMode ? 'login' : 'register');
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const username = $('auth-username').value.trim();
    const password = $('auth-password').value;

    if (username.length < 3) return showToast('Логин минимум 3 символа');
    if (password.length < 4) return showToast('Пароль минимум 4 символа');
    if (!/^[a-zA-Z0-9_а-яА-ЯёЁ]+$/.test(username)) return showToast('Только буквы, цифры и _');

    const users = Storage.getUsers();
    const pwHash = await hashPassword(password);

    if (state.isAuthRegisterMode) {
        if (users[username]) return showToast('Логин уже занят');
        users[username] = { passwordHash: pwHash, createdAt: Date.now() };
        Storage.saveUsers(users);
        showToast(`Аккаунт создан: ${username}`);
    } else {
        if (!users[username]) return showToast('Пользователь не найден');
        if (users[username].passwordHash !== pwHash) return showToast('Неверный пароль');
        showToast(`С возвращением, ${username}!`);
    }

    state.currentUser = { username };
    Storage.saveSession(state.currentUser);
    updateHeaderAuth();
    closeAuthModal();

    // Если была заявка на join — обработаем
    const params = new URLSearchParams(location.search);
    const joinId = params.get('join');
    if (joinId) {
        handleJoinLink(joinId);
    } else if (state.currentBlitzId) {
        renderBlitz();
    } else {
        renderHome();
    }
}

function logout() {
    state.currentUser = null;
    Storage.clearSession();
    updateHeaderAuth();
    goHome();
    showToast('Вы вышли из системы');
}

function updateHeaderAuth() {
    const area = $('auth-header-area');
    if (state.currentUser) {
        const initial = state.currentUser.username[0].toUpperCase();
        area.innerHTML = `
            <div class="user-badge">
                <div class="user-avatar">${escapeHtml(initial)}</div>
                <span>${escapeHtml(state.currentUser.username)}</span>
                <button class="btn btn-secondary" style="padding:0.2rem 0.5rem; font-size:0.7rem;" onclick="logout()">
                    <i class="fa-solid fa-right-from-bracket"></i>
                </button>
            </div>`;
    } else {
        area.innerHTML = `
            <button class="btn btn-secondary" onclick="openAuthModal('login')">
                <i class="fa-solid fa-right-to-bracket"></i> Войти
            </button>`;
    }
}

/* ==================== CREATE BLITZ ==================== */
function createBlitz(e) {
    e.preventDefault();
    if (!state.currentUser) return openAuthModal('login');

    const title = $('create-title').value.trim();
    const nProbs = parseInt($('create-problems').value, 10);
    const durationMin = parseInt($('create-duration').value, 10);
    const maxPlayers = parseInt($('create-max').value, 10);

    if (!title) return showToast('Введите название');
    if (maxPlayers < 2 || maxPlayers > 32) return showToast('Максимум участников: 2–32');

    const id = genId();
    const problems = TASK_POOL.slice(0, nProbs).map(p => ({ ...p, solved: false }));

    const blitz = {
        id,
        title,
        owner: state.currentUser.username,
        status: 'registration',
        maxPlayers,
        durationSeconds: durationMin * 60,
        problems,
        participants: [state.currentUser.username],
        scores: { [state.currentUser.username]: 0 },
        positions: { [state.currentUser.username]: 0 },
        startedAt: null,
        pausedAt: null,
        pausedTotal: 0,
        finishedAt: null,
        logs: [{
            time: timeStr(Date.now()),
            text: `Блиц создан. Организатор: ${state.currentUser.username}`,
            type: 'info'
        }],
        createdAt: Date.now()
    };

    Storage.saveBlitz(blitz);
    broadcast('BLITZ_CREATED', { id });

    // Показываем модалку с invite-ссылкой
    const link = `${location.origin}${location.pathname}?join=${id}`;
    $('invite-link-input').value = link;
    $('invite-modal').classList.add('active');

    // Запоминаем что нужно открыть этот блиц после закрытия модалки
    state.currentBlitzId = id;
}

function closeInviteModal() {
    $('invite-modal').classList.remove('active');
    if (state.currentBlitzId) {
        history.replaceState(null, '', `?blitz=${state.currentBlitzId}`);
        openBlitz(state.currentBlitzId, 'participants');
    }
}

function copyInviteLink() {
    const input = $('invite-link-input');
    navigator.clipboard.writeText(input.value).then(
        () => showToast('Ссылка скопирована!'),
        () => { input.select(); document.execCommand('copy'); showToast('Ссылка скопирована'); }
    );
}

/* ==================== JOIN VIA LINK ==================== */
function handleJoinLink(blitzId) {
    const blitz = Storage.getBlitz(blitzId);
    if (!blitz) {
        showToast('Блиц не найден или удалён');
        goHome();
        return;
    }

    if (!state.currentUser) {
        showToast('Войдите, чтобы присоединиться к блицу');
        openAuthModal('login');
        return;
    }

    const user = state.currentUser.username;

    // Уже участник — просто открываем
    if (blitz.participants.includes(user)) {
        showToast(`Вы уже участник «${blitz.title}»`);
        history.replaceState(null, '', `?blitz=${blitzId}`);
        openBlitz(blitzId);
        return;
    }

    // Проверяем лимит
    if (blitz.participants.length >= blitz.maxPlayers) {
        showToast('Блиц заполнен');
        history.replaceState(null, '', `?blitz=${blitzId}`);
        openBlitz(blitzId);
        return;
    }

    // Проверяем статус
    if (blitz.status !== 'registration') {
        showToast('Регистрация в этот блиц закрыта');
        history.replaceState(null, '', `?blitz=${blitzId}`);
        openBlitz(blitzId);
        return;
    }

    // Добавляем
    blitz.participants.push(user);
    blitz.scores[user] = 0;
    blitz.positions[user] = 0;
    blitz.logs.unshift({
        time: timeStr(Date.now()),
        text: `+ ${user} присоединился к блицу`,
        type: 'info'
    });
    Storage.saveBlitz(blitz);
    broadcast('BLITZ_UPDATED', { id: blitzId });

    showToast(`Вы присоединились к «${blitz.title}»!`);
    history.replaceState(null, '', `?blitz=${blitzId}`);
    openBlitz(blitzId);
}

/* ==================== BLITZ VIEW ==================== */
function renderBlitz() {
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz) return goHome();

    const isOwner = state.currentUser?.username === blitz.owner;
    const isParticipant = state.currentUser && blitz.participants.includes(state.currentUser.username);

    $('blitz-content').innerHTML = `
        <div class="breadcrumb" onclick="goHome()">
            <i class="fa-solid fa-arrow-left"></i> Все блицы
        </div>

        <div class="blitz-header">
            <div class="blitz-title-block">
                <h1>${escapeHtml(blitz.title)}</h1>
                <div style="display:flex; gap:0.75rem; align-items:center; font-size:0.85rem; color:var(--text-muted);">
                    <span class="status-badge status-${blitz.status}">${statusLabel(blitz.status)}</span>
                    <span><i class="fa-solid fa-user"></i> ${escapeHtml(blitz.owner)}</span>
                    <span><i class="fa-solid fa-users"></i> ${blitz.participants.length}/${blitz.maxPlayers}</span>
                </div>
            </div>
            <div id="timer-display-header" style="font-family:var(--font-code); font-size:1.5rem; font-weight:800; color:var(--accent-cyan);">
                ${blitz.status === 'active' ? formatTime(getRemaining(blitz)) : formatTime(blitz.durationSeconds)}
            </div>
        </div>

        <div class="blitz-tabs">
            <button class="blitz-tab ${state.blitzTab === 'participants' ? 'active' : ''}"
                    onclick="switchBlitzTab('participants')">
                <i class="fa-solid fa-users"></i> Участники
            </button>
            <button class="blitz-tab ${state.blitzTab === 'match' ? 'active' : ''}"
                    onclick="switchBlitzTab('match')"
                    ${(!isParticipant || blitz.status !== 'active') ? 'disabled' : ''}>
                <i class="fa-solid fa-code"></i> Матч
            </button>
            <button class="blitz-tab ${state.blitzTab === 'spectator' ? 'active' : ''}"
                    onclick="switchBlitzTab('spectator')">
                <i class="fa-solid fa-eye"></i> Зритель
            </button>
            ${isOwner ? `
            <button class="blitz-tab ${state.blitzTab === 'admin' ? 'active' : ''}"
                    onclick="switchBlitzTab('admin')">
                <i class="fa-solid fa-sliders"></i> Управление
            </button>` : ''}
        </div>

        <div id="blitz-tab-content"></div>
    `;

    renderBlitzTabContent(blitz);
}

function switchBlitzTab(tab) {
    state.blitzTab = tab;
    renderBlitz();
}

function renderBlitzTabContent(blitz) {
    const content = $('blitz-tab-content');
    switch (state.blitzTab) {
        case 'participants': content.innerHTML = buildParticipantsTab(blitz); break;
        case 'match':        content.innerHTML = buildMatchTab(blitz); break;
        case 'spectator':    content.innerHTML = buildSpectatorTab(blitz); break;
        case 'admin':        content.innerHTML = buildAdminTab(blitz); break;
    }

    // Если матч — инициализируем редактор
    if (state.blitzTab === 'match') {
        initEditorInBlitz();
    }
    if (state.blitzTab === 'spectator') {
        updateSpectatorVisuals(blitz);
    }
}

/* ==================== TAB: PARTICIPANTS ==================== */
function buildParticipantsTab(blitz) {
    const inviteLink = `${location.origin}${location.pathname}?join=${blitz.id}`;
    const isOwner = state.currentUser?.username === blitz.owner;
    const isParticipant = state.currentUser && blitz.participants.includes(state.currentUser.username);

    let actionBlock = '';
    if (blitz.status === 'registration') {
        if (isParticipant) {
            actionBlock = `
                <div style="padding:1rem; background:rgba(16,185,129,0.1); border:1px solid var(--success-green); border-radius:10px; color:var(--success-green); font-weight:600;">
                    <i class="fa-solid fa-check-circle"></i> Вы записаны. Ждите старта от организатора.
                </div>`;
        } else if (state.currentUser) {
            actionBlock = `
                <button class="btn btn-primary" style="width:100%;" onclick="joinCurrentBlitz()">
                    <i class="fa-solid fa-door-open"></i> Присоединиться к блицу
                </button>`;
        }
    }

    return `
        <div class="glass-card" style="margin-bottom:1.5rem;">
            <h3 style="margin-bottom:0.75rem;"><i class="fa-solid fa-link" style="color:var(--accent-cyan);"></i> Ссылка-приглашение</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:0.75rem;">
                Отправьте участникам — они смогут присоединиться после входа.
            </p>
            <div class="invite-box">
                <input type="text" value="${escapeHtml(inviteLink)}" readonly id="blitz-invite-link">
                <button class="btn btn-secondary" onclick="copyBlitzInvite()">
                    <i class="fa-solid fa-copy"></i> Копировать
                </button>
            </div>
        </div>

        <div class="glass-card">
            <h3 style="margin-bottom:0.5rem;">Участники (${blitz.participants.length}/${blitz.maxPlayers})</h3>
            <ul class="participant-list">
                ${blitz.participants.map((p, i) => `
                    <li class="participant-item">
                        <span>
                            <span class="participant-rank">#${i + 1}</span>
                            <span style="font-weight:600;">${escapeHtml(p)}</span>
                            ${p === blitz.owner ? '<span style="margin-left:0.5rem; font-size:0.7rem; color:var(--accent-cyan);">👑 организатор</span>' : ''}
                            ${p === state.currentUser?.username ? '<span style="margin-left:0.5rem; font-size:0.7rem; color:var(--p1-color);">вы</span>' : ''}
                        </span>
                    </li>`).join('')}
            </ul>
            ${actionBlock ? `<div style="margin-top:1.5rem;">${actionBlock}</div>` : ''}
        </div>
    `;
}

function copyBlitzInvite() {
    const input = $('blitz-invite-link');
    navigator.clipboard.writeText(input.value).then(
        () => showToast('Ссылка скопирована'),
        () => { input.select(); document.execCommand('copy'); showToast('Ссылка скопирована'); }
    );
}

function joinCurrentBlitz() {
    if (!state.currentUser) return openAuthModal('login');
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz) return;

    if (blitz.participants.includes(state.currentUser.username)) {
        return showToast('Вы уже участник');
    }
    if (blitz.participants.length >= blitz.maxPlayers) {
        return showToast('Блиц заполнен');
    }
    if (blitz.status !== 'registration') {
        return showToast('Регистрация закрыта');
    }

    blitz.participants.push(state.currentUser.username);
    blitz.scores[state.currentUser.username] = 0;
    blitz.positions[state.currentUser.username] = 0;
    blitz.logs.unshift({ time: timeStr(Date.now()), text: `+ ${state.currentUser.username} присоединился`, type: 'info' });

    Storage.saveBlitz(blitz);
    broadcast('BLITZ_UPDATED', { id: blitz.id });
    showToast('Вы присоединились!');
    renderBlitz();
}

/* ==================== TAB: MATCH ==================== */
function buildMatchTab(blitz) {
    const user = state.currentUser.username;
    const problem = blitz.problems[state.activeProblemIdx];

    return `
        <div class="timer-header" id="match-timer">
            <span><i class="fa-solid fa-stopwatch"></i> <span id="timer-display">${formatTime(getRemaining(blitz))}</span></span>
            <span class="role-badge">${escapeHtml(user)} · ${blitz.scores[user] || 0}/${blitz.problems.length}</span>
        </div>

        <div class="match-workspace">
            <div class="problems-sidebar">
                ${blitz.problems.map((p, i) => `
                    <div class="problem-tab ${i === state.activeProblemIdx ? 'active' : ''}"
                         onclick="selectProblem(${i})">
                        <div>
                            <strong>${escapeHtml(p.id)}</strong>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(p.name)}</div>
                        </div>
                        <i class="fa-solid ${p.solved ? 'fa-circle-check status-solved' : 'fa-circle-dash status-none'} problem-status-icon"></i>
                    </div>
                `).join('')}
            </div>

            <div class="glass-card problem-statement">
                <div class="problem-title">${escapeHtml(problem.id)}. ${escapeHtml(problem.name)}</div>
                <div id="prob-body" style="line-height:1.6; color:#d1d5db; font-size:0.95rem;">
                    ${renderMarkdown(problem.desc)}
                </div>
            </div>

            <div class="glass-card editor-container">
                <div class="editor-header">
                    <select id="lang-select" class="form-control" style="width:auto;" onchange="changeLanguage()">
                        <option value="python">Python 3.10</option>
                        <option value="cpp">C++ 17</option>
                    </select>
                    <span style="font-size:0.8rem; color:var(--text-muted);">
                        <i class="fa-solid fa-floppy-disk"></i> Автосохранение
                    </span>
                </div>
                <textarea id="code-editor"></textarea>
                <div id="verdict-box" class="verdict-banner">
                    <i class="fa-solid fa-spinner fa-spin" id="verdict-spinner" style="display:none;"></i>
                    <span id="verdict-text"></span>
                </div>
                <button class="btn btn-primary" style="width:100%;" onclick="submitSolution()">
                    <i class="fa-solid fa-paper-plane"></i> Отправить решение
                </button>
            </div>
        </div>
    `;
}

function selectProblem(idx) {
    state.activeProblemIdx = idx;
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz) return;
    const p = blitz.problems[idx];

    document.querySelectorAll('.problem-tab').forEach((el, i) => el.classList.toggle('active', i === idx));

    $('prob-body').innerHTML = renderMarkdown(p.desc);
    document.querySelector('.problem-title').innerText = `${p.id}. ${p.name}`;
}

/* ==================== CODE EDITOR ==================== */
function initEditorInBlitz() {
    const textarea = $('code-editor');
    if (!textarea || typeof CodeMirror === 'undefined') return;

    state.editor = CodeMirror.fromTextArea(textarea, {
        mode: 'python',
        theme: 'material-darker',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        autoCloseBrackets: true,
        lineWrapping: true
    });

    // Загружаем сохранённый код
    codeCacheLoad();
    state.editor.setValue(state.codeCache.python || PY_TEMPLATE);

    state.editor.on('change', () => {
        const lang = $('lang-select')?.value || 'python';
        state.codeCache[lang] = state.editor.getValue();
        saveCodeCache();
    });
}

function codeCacheLoad() {
    const key = `foncode_code_${state.currentUser?.username || 'anon'}`;
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved) state.codeCache = { python: saved.python || '', cpp: saved.cpp || '' };
    } catch (e) {}
}
function saveCodeCache() {
    const key = `foncode_code_${state.currentUser?.username || 'anon'}`;
    localStorage.setItem(key, JSON.stringify(state.codeCache));
}

function changeLanguage() {
    if (!state.editor) return;
    const newLang = $('lang-select').value;
    const oldMode = state.editor.getOption('mode');
    const oldLang = oldMode === 'python' ? 'python' : 'cpp';

    state.codeCache[oldLang] = state.editor.getValue();
    saveCodeCache();

    if (newLang === 'cpp') {
        state.editor.setOption('mode', 'text/x-c++src');
        state.editor.setValue(state.codeCache.cpp || CPP_TEMPLATE);
    } else {
        state.editor.setOption('mode', 'python');
        state.editor.setValue(state.codeCache.python || PY_TEMPLATE);
    }
}

/* ==================== MARKDOWN ==================== */
function renderMarkdown(text) {
    if (!text) return '';
    let html = text;
    html = html.replace(/\$\$(.+?)\$\$/gs, (_, f) => {
        try { return katex.renderToString(f, { displayMode: true, throwOnError: false }); }
        catch (e) { return _; }
    });
    html = html.replace(/\$(.+?)\$/g, (_, f) => {
        try { return katex.renderToString(f, { displayMode: false, throwOnError: false }); }
        catch (e) { return _; }
    });
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.4);padding:2px 6px;border-radius:4px;">$1</code>');
    html = html.replace(/```([\s\S]+?)```/g, '<pre style="background:#0a0a0a;padding:0.75rem;border-radius:8px;overflow-x:auto;margin:0.5rem 0;"><code>$1</code></pre>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

/* ==================== SUBMIT ==================== */
function submitSolution() {
    if (!state.currentUser) return showToast('Войдите в аккаунт');
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz) return;

    const user = state.currentUser.username;
    if (!blitz.participants.includes(user)) return showToast('Вы не участник');
    if (blitz.status !== 'active') return showToast('Блиц не активен');

    const prob = blitz.problems[state.activeProblemIdx];
    const banner = $('verdict-box');
    const spinner = $('verdict-spinner');
    const text = $('verdict-text');

    banner.className = 'verdict-banner verdict-PENDING';
    spinner.style.display = 'inline-block';
    text.innerText = 'Тестирование...';

    setTimeout(() => {
        spinner.style.display = 'none';
        const isSuccess = Math.random() > 0.35;

        // Перечитываем blitz чтобы не было race condition
        const freshBlitz = Storage.getBlitz(state.currentBlitzId);

        if (isSuccess && !freshBlitz.problems[state.activeProblemIdx].solved) {
            freshBlitz.problems[state.activeProblemIdx].solved = true;

            // Проверяем, может этот юзер уже решал эту задачу — считаем его очки
            const userScore = freshBlitz.scores[user] || 0;
            // Прибавляем только если это новая решённая задача для него
            // Упрощённо: всегда +1, но с защитой от дублирования через отдельный трекер
            freshBlitz.scores[user] = userScore + 1;
            freshBlitz.positions[user] = Math.min(freshBlitz.problems.length, (freshBlitz.positions[user] || 0) + 1);

            banner.className = 'verdict-banner verdict-OK';
            text.innerText = 'ВЕРДИКТ: OK — задача зачтена!';
            freshBlitz.logs.unshift({
                time: timeStr(Date.now()),
                text: `✅ ${user} решил задачу ${prob.id}`,
                type: 'ok'
            });

            // Проверяем завершение — все ли решили всё?
            const allDone = freshBlitz.participants.every(p => freshBlitz.scores[p] >= freshBlitz.problems.length);
            if (allDone) {
                finishBlitz(freshBlitz);
            }
        } else {
            banner.className = 'verdict-banner verdict-WA';
            text.innerText = `ВЕРДИКТ: WA (неверный ответ)`;
            freshBlitz.logs.unshift({
                time: timeStr(Date.now()),
                text: `❌ ${user}: WA на задаче ${prob.id}`,
                type: 'wa'
            });
        }

        Storage.saveBlitz(freshBlitz);
        broadcast('BLITZ_UPDATED', { id: freshBlitz.id });

        // Обновляем UI
        renderBlitz();
    }, 1200);
}

/* ==================== TAB: SPECTATOR ==================== */
function buildSpectatorTab(blitz) {
    return `
        <div class="timer-header" id="match-timer">
            <span><i class="fa-solid fa-stopwatch"></i> <span id="timer-display">${formatTime(getRemaining(blitz))}</span></span>
            <span style="font-size:0.9rem; color:var(--text-muted);">
                ${blitz.participants.length} участников · ${blitz.problems.length} задач
            </span>
        </div>

        <div class="map-track-container" id="race-track">
            <div class="track-line-bg"></div>
            <div class="track-checkpoints" id="track-checkpoints"></div>
            <div class="player-tokens-layer" id="tokens-layer"></div>
        </div>

        <div class="glass-card" style="margin-top:1.5rem;">
            <h3 style="margin-bottom:1rem;"><i class="fa-solid fa-ranking-star"></i> Таблица лидеров</h3>
            <div class="leaderboard" id="leaderboard"></div>
        </div>

        <div class="glass-card" style="margin-top:1.5rem;">
            <h3 style="margin-bottom:0.75rem; font-size:1rem; color:var(--text-muted);">
                <i class="fa-solid fa-list-ul"></i> События
            </h3>
            <div class="events-log-container" id="events-log"></div>
        </div>
    `;
}

function updateSpectatorVisuals(blitz) {
    // Таймер
    const td = $('timer-display');
    if (td) td.innerText = formatTime(getRemaining(blitz));

    // Чекпоинты
    const cps = $('track-checkpoints');
    if (cps) {
        cps.innerHTML = blitz.problems.map((p, i) => {
            const solvedByAny = blitz.positions && Object.values(blitz.positions).some(pos => pos > i);
            return `
                <div class="checkpoint ${solvedByAny ? 'solved' : ''}">
                    <div class="checkpoint-node">${escapeHtml(p.id)}</div>
                    <div class="checkpoint-label">${escapeHtml(p.name)}</div>
                </div>`;
        }).join('');
    }

    // Токены
    const tokens = $('tokens-layer');
    if (tokens) {
        const total = Math.max(1, blitz.problems.length);
        const n = blitz.participants.length || 1;
        const height = 180;
        tokens.innerHTML = blitz.participants.map((p, i) => {
            const pos = blitz.positions[p] || 0;
            const leftPct = (pos / total) * 100;
            const top = 20 + (i * (height / Math.max(1, n - 1 || 1)));
            return `
                <div class="player-token"
                     style="left: ${leftPct}%; top: ${top - height/2}px; background: ${playerColor(p)};"
                     title="${escapeHtml(p)}: ${pos}/${total}">
                    ${escapeHtml(p)}
                </div>`;
        }).join('');
    }

    // Лидерборд
    const lb = $('leaderboard');
    if (lb) {
        const sorted = [...blitz.participants].sort((a, b) => {
            const sa = blitz.scores[a] || 0, sb = blitz.scores[b] || 0;
            if (sb !== sa) return sb - sa;
            return a.localeCompare(b);
        });
        lb.innerHTML = sorted.map((p, i) => `
            <div class="leaderboard-row ${i === 0 && (blitz.scores[p] || 0) > 0 ? 'first' : ''}">
                <div class="leaderboard-rank">${i + 1}</div>
                <div class="leaderboard-name">${escapeHtml(p)}</div>
                <div class="leaderboard-score">${blitz.scores[p] || 0}</div>
                <div class="leaderboard-position">${blitz.positions[p] || 0}/${blitz.problems.length}</div>
            </div>`).join('');
    }

    // Логи
    const log = $('events-log');
    if (log) {
        log.innerHTML = blitz.logs.slice(0, 100).map(l => `
            <div class="log-item">
                <span class="log-time">[${escapeHtml(l.time)}]</span>
                <span style="color: ${
                    l.type === 'ok' ? 'var(--success-green)' :
                    l.type === 'wa' ? 'var(--error-red)' :
                    'var(--text-main)'}">${escapeHtml(l.text)}</span>
            </div>`).join('');
    }
}

/* ==================== TAB: ADMIN ==================== */
function buildAdminTab(blitz) {
    const canStart = blitz.status === 'registration' && blitz.participants.length >= 1;
    const isActive = blitz.status === 'active';
    const isPaused = !!blitz.pausedAt;

    return `
        <div class="glass-card" style="margin-bottom:1.5rem;">
            <h3 style="margin-bottom:1rem;"><i class="fa-solid fa-play-circle" style="color:var(--success-green);"></i> Управление турниром</h3>

            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                ${blitz.status === 'registration' ? `
                    <button class="btn btn-primary" ${canStart ? '' : 'disabled'} onclick="startBlitz()">
                        <i class="fa-solid fa-flag-checkered"></i> Начать блиц
                    </button>` : ''}

                ${isActive ? `
                    ${isPaused
                        ? `<button class="btn btn-success" onclick="resumeBlitz()"><i class="fa-solid fa-play"></i> Возобновить</button>`
                        : `<button class="btn btn-secondary" onclick="pauseBlitz()"><i class="fa-solid fa-pause"></i> Пауза</button>`}
                    <button class="btn btn-secondary" onclick="addTime(300)"><i class="fa-solid fa-clock"></i> +5 мин</button>
                    <button class="btn btn-secondary" onclick="finishBlitz(Storage.getBlitz(state.currentBlitzId))"><i class="fa-solid fa-flag"></i> Завершить</button>
                ` : ''}

                <button class="btn btn-danger" onclick="deleteBlitz()">
                    <i class="fa-solid fa-trash"></i> Удалить блиц
                </button>
            </div>
        </div>

        <div class="glass-card">
            <h3 style="margin-bottom:0.75rem;"><i class="fa-solid fa-users"></i> Участники (${blitz.participants.length})</h3>
            ${blitz.participants.length === 0
                ? '<p style="color:var(--text-muted);">Никто ещё не присоединился. Отправьте ссылку-приглашение.</p>'
                : `<ul class="participant-list">
                    ${blitz.participants.map(p => `
                        <li class="participant-item">
                            <span>${escapeHtml(p)} ${p === blitz.owner ? '👑' : ''}</span>
                            ${p !== blitz.owner ? `
                                <button class="btn btn-danger" style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                                        onclick="kickParticipant('${escapeHtml(p)}')">
                                    <i class="fa-solid fa-user-minus"></i>
                                </button>` : ''}
                        </li>`).join('')}
                </ul>`}
        </div>
    `;
}

function startBlitz() {
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz) return;
    if (blitz.participants.length < 1) return showToast('Нужен хотя бы 1 участник');

    blitz.status = 'active';
    blitz.startedAt = Date.now();
    blitz.pausedAt = null;
    blitz.pausedTotal = 0;
    blitz.logs.unshift({ time: timeStr(Date.now()), text: '🚀 Блиц начался!', type: 'ok' });
    Storage.saveBlitz(blitz);
    broadcast('BLITZ_UPDATED', { id: blitz.id });
    showToast('Блиц начался!');
    state.blitzTab = 'spectator';
    renderBlitz();
}

function pauseBlitz() {
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz || blitz.pausedAt) return;
    blitz.pausedAt = Date.now();
    blitz.logs.unshift({ time: timeStr(Date.now()), text: '⏸ Пауза', type: 'info' });
    Storage.saveBlitz(blitz);
    broadcast('BLITZ_UPDATED', { id: blitz.id });
    renderBlitz();
}

function resumeBlitz() {
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz || !blitz.pausedAt) return;
    blitz.pausedTotal = (blitz.pausedTotal || 0) + (Date.now() - blitz.pausedAt);
    blitz.pausedAt = null;
    blitz.logs.unshift({ time: timeStr(Date.now()), text: '▶ Возобновление', type: 'info' });
    Storage.saveBlitz(blitz);
    broadcast('BLITZ_UPDATED', { id: blitz.id });
    renderBlitz();
}

function addTime(seconds) {
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz) return;
    blitz.durationSeconds += seconds;
    blitz.logs.unshift({ time: timeStr(Date.now()), text: `⏱ Добавлено ${seconds / 60} мин`, type: 'info' });
    Storage.saveBlitz(blitz);
    broadcast('BLITZ_UPDATED', { id: blitz.id });
    renderBlitz();
}

function finishBlitz(blitz) {
    if (!blitz || blitz.status === 'finished') return;
    blitz.status = 'finished';
    blitz.finishedAt = Date.now();

    const sorted = [...blitz.participants].sort((a, b) => (blitz.scores[b] || 0) - (blitz.scores[a] || 0));
    const winner = sorted[0];
    blitz.logs.unshift({ time: timeStr(Date.now()), text: `🏆 Блиц завершён! Победитель: ${winner}`, type: 'ok' });
    Storage.saveBlitz(blitz);
    broadcast('BLITZ_UPDATED', { id: blitz.id });
    showToast(`Победитель: ${winner}!`);
    renderBlitz();
}

function deleteBlitz() {
    if (!confirm('Удалить блиц безвозвратно?')) return;
    const id = state.currentBlitzId;
    Storage.deleteBlitz(id);
    broadcast('BLITZ_DELETED', { id });
    showToast('Блиц удалён');
    goHome();
}

function kickParticipant(username) {
    const blitz = Storage.getBlitz(state.currentBlitzId);
    if (!blitz) return;
    blitz.participants = blitz.participants.filter(p => p !== username);
    delete blitz.scores[username];
    delete blitz.positions[username];
    blitz.logs.unshift({ time: timeStr(Date.now()), text: `− ${username} удалён`, type: 'info' });
    Storage.saveBlitz(blitz);
    broadcast('BLITZ_UPDATED', { id: blitz.id });
    renderBlitz();
}

/* ==================== TIMER HELPERS ==================== */
function getRemaining(blitz) {
    if (!blitz.startedAt) return blitz.durationSeconds;
    const now = blitz.pausedAt || Date.now();
    const elapsed = Math.floor((now - blitz.startedAt - (blitz.pausedTotal || 0)) / 1000);
    return Math.max(0, blitz.durationSeconds - elapsed);
}

function formatTime(seconds) {
    const m = Math.floor(Math.max(0, seconds) / 60);
    const s = Math.max(0, seconds) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timeStr(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

/* ==================== TOAST ==================== */
function showToast(msg) {
    const toast = $('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.style.display = 'none', 3000);
}