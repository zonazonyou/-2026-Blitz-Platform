/* ==================== STATE & DEMO DATA ==================== */
const state = {
    activeView: 'bracket',
    bigScreen: false,
    timerSeconds: 1200, // 20 minutes
    timerInterval: null,
    simInterval: null,
    players: ['Ира', 'Дима', 'Саша', 'Коля', 'Лена', 'Артём', 'Влад', 'Маша'],
    activeProblemIdx: 0,
    problems: [
        { id: 'A', name: 'Массив Вспышек', solved: true, desc: 'Дана последовательность целых чисел $A_1, A_2, \\dots, A_N$. Найдите максимальную сумму подмассива, где разность между любыми двумя элементами не превосходит $K$.\n\n**Формат ввода:** В первой строке числа $N$ и $K$ ($1 \\le N \\le 10^5$).\n\n**Пример:**\n```\n5 2\n1 2 3 9 10\n```\n**Вывод:** `6`' },
        { id: 'B', name: 'Квантовый Запрос', solved: false, desc: 'Обработайте $Q$ запросов добавления точек на плоскости. Требуется быстро находить расстояние Манхэттена до ближайшей точки за $O(\\log N)$.\n\n**Ограничения:** $Q \\le 2 \\cdot 10^5$, время 1.0s, память 256MB.' },
        { id: 'C', name: 'Дерево Резонанса', solved: false, desc: 'Задано взвешенное дерево из $N$ вершин. Определите количество путей, суммарный вес которых является простым числом.' },
        { id: 'D', name: 'Поток Энергии', solved: false, desc: 'Найдите максимальный поток в сети с динамически меняющимися пропускными способностями ребер.' },
        { id: 'E', name: 'Спектральный Граф', solved: false, desc: 'Вычислите собственные значения матрицы смежности для гиперкуба $d$-й размерности.' }
    ],
    spectatorMatch: {
        p1: 'Ира',
        p2: 'Дима',
        p1Score: 2,
        p2Score: 1,
        p1Pos: 2, // Checkpoint index (0 to 4)
        p2Pos: 1,
        logs: [
            { time: '00:00', text: 'Старт матча! Задачи открыты.', type: 'info' },
            { time: '01:45', text: 'Ира сдала задачу A (OK с 1 попытки)', type: 'p1' },
            { time: '03:12', text: 'Дима получил WA на задаче A (тест 7)', type: 'p2' },
            { time: '04:05', text: 'Дима сдал задачу A (OK)', type: 'p2' },
            { time: '06:20', text: 'Ира сдала задачу B (OK)', type: 'p1' }
        ]
    }
};

let editorInstance = null;

/* ==================== WEB AUDIO SYNTHESIZER ==================== */
function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'solve') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'fail') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.25);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        }
    } catch(e) { /* Audio fallback silently */ }
}

/* ==================== INITIALIZATION ==================== */
document.addEventListener('DOMContentLoaded', () => {
    initCodeMirror();
    renderBracket();
    renderParticipantsAdmin();
    renderParticipantProblems();
    renderSpectatorTrack();
    startMatchTimer();
    startSpectatorSimulation();

    // Load saved code from LocalStorage
    const savedCode = localStorage.getItem('foncode_saved_code');
    if (savedCode && editorInstance) {
        editorInstance.setValue(savedCode);
    }
});

/* ==================== NAVIGATION ==================== */
function switchView(viewId) {
    state.activeView = viewId;
    document.querySelectorAll('.view-screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${viewId}`).classList.add('active');

    const btnIdx = ['bracket', 'spectator', 'match', 'admin'].indexOf(viewId);
    if (btnIdx !== -1) {
        document.querySelectorAll('.nav-btn')[btnIdx].classList.add('active');
    }

    if (viewId === 'match' && editorInstance) {
        setTimeout(() => editorInstance.refresh(), 100);
    }
}

function toggleBigScreen() {
    state.bigScreen = !state.bigScreen;
    document.body.classList.toggle('big-screen-mode', state.bigScreen);
    showToast(state.bigScreen ? 'Включен режим трансляции' : 'Выход из режима трансляции');
}

/* ==================== BRACKET ==================== */
function renderBracket() {
    const target = document.getElementById('bracket-render-target');
    target.innerHTML = `
        <div class="bracket-round">
            <div class="round-title">1/4 Финала</div>
            ${createMatchHtml('Ира', 'Саша', '2 : 0', 'FINISHED', 'Ира')}
            ${createMatchHtml('Дима', 'Коля', '2 : 1', 'FINISHED', 'Дима')}
            ${createMatchHtml('Лена', 'Артём', '2 : 0', 'FINISHED', 'Лена')}
            ${createMatchHtml('Влад', 'Маша', '1 : 2', 'FINISHED', 'Маша')}
        </div>

        <div class="bracket-round">
            <div class="round-title">1/2 Финала</div>
            ${createMatchHtml('Ира', 'Дима', '2 : 1', 'LIVE', null, true)}
            ${createMatchHtml('Лена', 'Маша', '0 : 0', 'UPCOMING', null)}
        </div>

        <div class="bracket-round">
            <div class="round-title"><i class="fa-solid fa-trophy" style="color: gold;"></i> Финал</div>
            ${createMatchHtml('TBD', 'TBD', '0 : 0', 'UPCOMING', null)}
        </div>
    `;
}

function createMatchHtml(p1, p2, score, status, winner, isLive = false) {
    const p1Score = score.split(':')[0].trim();
    const p2Score = score.split(':')[1].trim();

    return `
        <div class="match-card ${isLive ? 'live' : ''}">
            <div class="match-player ${winner === p1 ? 'winner' : (winner ? 'loser' : '')}">
                <span>${p1}</span>
                <span class="player-score">${p1Score}</span>
            </div>
            <div class="match-player ${winner === p2 ? 'winner' : (winner ? 'loser' : '')}">
                <span>${p2}</span>
                <span class="player-score">${p2Score}</span>
            </div>
            <div class="match-actions">
                <span class="match-status-tag">${isLive ? '<span style="color:var(--p1-color)">● В ЭФИРЕ</span>' : status}</span>
                <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="openMatchFromBracket('${p1}', '${p2}')">
                    ${isLive ? 'Смотреть' : 'Обзор'}
                </button>
            </div>
        </div>
    `;
}

function openMatchFromBracket(p1, p2) {
    state.spectatorMatch.p1 = p1;
    state.spectatorMatch.p2 = p2;
    document.getElementById('spec-p1-name').innerText = p1;
    document.getElementById('spec-p2-name').innerText = p2;
    document.getElementById('token-p1').innerText = p1;
    document.getElementById('token-p2').innerText = p2;
    switchView('spectator');
}

/* ==================== ADMIN PANEL ==================== */
function renderParticipantsAdmin() {
    const ul = document.getElementById('participants-ul');
    ul.innerHTML = state.players.map((p, idx) => `
        <li class="participant-item">
            <span><strong style="color:var(--accent-cyan); margin-right: 0.5rem;">#${idx+1}</strong> ${p}</span>
            <button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="removeParticipant(${idx})">
                <i class="fa-solid fa-trash"></i>
            </button>
        </li>
    `).join('');
}

function addParticipant() {
    const input = document.getElementById('new-player-name');
    if (input.value.trim()) {
        state.players.push(input.value.trim());
        input.value = '';
        renderParticipantsAdmin();
        showToast('Участник добавлен!');
    }
}

function removeParticipant(idx) {
    state.players.splice(idx, 1);
    renderParticipantsAdmin();
}

function copyInviteLink() {
    const input = document.getElementById('invite-url');
    navigator.clipboard.writeText(input.value);
    showToast('Ссылка-приглашение скопирована!');
}

function generateBracketFromAdmin() {
    renderBracket();
    switchView('bracket');
    showToast('Турнирная сетка успешно сгенерирована!');
}

function triggerAdminAction(action) {
    showToast(`Админ-действие: ${action}`);
    addMatchLog(`[АДМИН]: Применено действие - ${action}`, 'info');
}

/* ==================== CODE EDITOR & WORKSPACE ==================== */
function initCodeMirror() {
    const textarea = document.getElementById('code-editor');
    editorInstance = CodeMirror.fromTextArea(textarea, {
        mode: 'python',
        theme: 'material-darker',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        autoCloseBrackets: true
    });

    editorInstance.setValue(`def solve():\n    # Напишите ваше решение здесь\n    import sys\n    input = sys.stdin.read\n    data = input().split()\n    if not data:\n        return\n    \n    n, k = int(data[0]), int(data[1])
    arr = list(map(int, data[2:]))
    arr.sort()

    # Алгоритм скользящего окна
    max_sum = 0
    # ...
    print(max_sum)\n\nsolve()`);

    editorInstance.on('change', () => {
        localStorage.setItem('foncode_saved_code', editorInstance.getValue());
    });
}

function changeLanguage() {
    const lang = document.getElementById('lang-select').value;
    if (lang === 'cpp') {
        editorInstance.setOption('mode', 'text/x-c++src');
        editorInstance.setValue(`#include <iostream>\n#include <vector>\n#include <algorithm>\n\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    // Ваш код здесь\n    return 0;\n}`);
    } else {
        editorInstance.setOption('mode', 'python');
    }
}

function renderParticipantProblems() {
    const sidebar = document.getElementById('problems-list');
    sidebar.innerHTML = state.problems.map((p, idx) => `
        <div class="problem-tab ${idx === state.activeProblemIdx ? 'active' : ''}" onclick="selectProblem(${idx})">
            <div>
                <strong>Задача ${p.id}</strong>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${p.name}</div>
            </div>
            <i class="fa-solid ${p.solved ? 'fa-circle-check status-solved' : 'fa-circle-dash status-none'} problem-status-icon"></i>
        </div>
    `).join('');

    selectProblem(state.activeProblemIdx);
}

function selectProblem(idx) {
    state.activeProblemIdx = idx;
    document.querySelectorAll('.problem-tab').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
    });

    const prob = state.problems[idx];
    document.getElementById('prob-title').innerText = `${prob.id}. ${prob.name}`;
    document.getElementById('prob-body').innerHTML = prob.desc.replace(/\n/g, '<br>');

    if (window.katex) {
        setTimeout(() => {
            document.querySelectorAll('#prob-body').forEach(el => {
                el.innerHTML = el.innerHTML.replace(/\$(.*?)\$/g, (match, formula) => {
                    try { return katex.renderToString(formula, { displayMode: false }); }
                    catch(e) { return match; }
                });
            });
        }, 50);
    }
}

function submitSolution() {
    const banner = document.getElementById('verdict-box');
    const text = document.getElementById('verdict-text');
    const spinner = document.getElementById('verdict-spinner');

    banner.className = 'verdict-banner verdict-PENDING';
    spinner.style.display = 'inline-block';
    text.innerText = 'Тестирование решения на тесте 1...';

    setTimeout(() => {
        text.innerText = 'Тестирование решения на тесте 12...';
    }, 800);

    setTimeout(() => {
        const verdicts = ['OK', 'OK', 'WA', 'TL'];
        const res = verdicts[Math.floor(Math.random() * verdicts.length)];

        spinner.style.display = 'none';
        if (res === 'OK') {
            banner.className = 'verdict-banner verdict-OK';
            text.innerText = 'ВЕРДИКТ: OK (Полное решение) - 100 баллов!';
            state.problems[state.activeProblemIdx].solved = true;
            renderParticipantProblems();
            playSound('solve');
            addMatchLog(`Участник отправил решение ${state.problems[state.activeProblemIdx].id}: ВЕРДИКТ OK`, 'p1');
        } else {
            banner.className = 'verdict-banner verdict-WA';
            text.innerText = `ВЕРДИКТ: ${res} (Ошибка на тесте ${Math.floor(Math.random()*15)+1})`;
            playSound('fail');
            addMatchLog(`Участник отправил решение ${state.problems[state.activeProblemIdx].id}: ВЕРДИКТ ${res}`, 'p2');
        }
    }, 1800);
}

function startMatchTimer() {
    state.timerInterval = setInterval(() => {
        state.timerSeconds--;
        if (state.timerSeconds <= 0) clearInterval(state.timerInterval);

        const m = Math.floor(state.timerSeconds / 60).toString().padStart(2, '0');
        const s = (state.timerSeconds % 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${m}:${s}`;

        if (state.timerSeconds < 180) {
            document.getElementById('match-timer').classList.add('warning');
        }
    }, 1000);
}

/* ==================== SPECTATOR MAP & SIMULATION ==================== */
function renderSpectatorTrack() {
    const checkpointsContainer = document.getElementById('track-checkpoints');
    checkpointsContainer.innerHTML = state.problems.map((p, idx) => `
        <div class="checkpoint ${idx <= state.spectatorMatch.p1Pos ? 'active-p1' : ''} ${idx <= state.spectatorMatch.p2Pos ? 'active-p2' : ''}" id="cp-${idx}">
            <div class="checkpoint-node">${p.id}</div>
            <div class="checkpoint-label">${p.name}</div>
        </div>
    `).join('');

    updateTokenPositions();
    renderLogs();
}

function updateTokenPositions() {
    const p1Pct = (state.spectatorMatch.p1Pos / (state.problems.length - 1)) * 100;
    const p2Pct = (state.spectatorMatch.p2Pos / (state.problems.length - 1)) * 100;

    const t1 = document.getElementById('token-p1');
    const t2 = document.getElementById('token-p2');

    t1.style.left = `${p1Pct}%`;
    t2.style.left = `${p2Pct}%`;

    document.getElementById('score-p1').innerText = state.spectatorMatch.p1Score;
    document.getElementById('score-p2').innerText = state.spectatorMatch.p2Score;
}

function addMatchLog(text, type = 'info') {
    const now = new Date();
    const timeStr = `${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    state.spectatorMatch.logs.unshift({ time: timeStr, text, type });
    renderLogs();
}

function renderLogs() {
    const container = document.getElementById('events-log');
    container.innerHTML = state.spectatorMatch.logs.map(log => `
        <div class="log-item">
            <span class="log-time">[${log.time}]</span>
            <span style="color: ${log.type === 'p1' ? 'var(--p1-color)' : log.type === 'p2' ? 'var(--p2-color)' : 'var(--text-main)'}">
                ${log.text}
            </span>
        </div>
    `).join('');
}

function startSpectatorSimulation() {
    state.simInterval = setInterval(() => {
        if (state.activeView !== 'spectator') return;

        const rand = Math.random();
        if (rand > 0.6) {
            const isP1 = Math.random() > 0.5;
            const player = isP1 ? state.spectatorMatch.p1 : state.spectatorMatch.p2;
            const currentPos = isP1 ? state.spectatorMatch.p1Pos : state.spectatorMatch.p2Pos;

            if (currentPos < state.problems.length - 1) {
                const probId = state.problems[currentPos + 1].id;
                const isSuccess = Math.random() > 0.35;

                if (isSuccess) {
                    if (isP1) {
                        state.spectatorMatch.p1Pos++;
                        state.spectatorMatch.p1Score++;
                        animateTokenPulse('token-p1');
                    } else {
                        state.spectatorMatch.p2Pos++;
                        state.spectatorMatch.p2Score++;
                        animateTokenPulse('token-p2');
                    }
                    playSound('solve');
                    addMatchLog(`🔥 ${player} успешно решает задачу ${probId} (OK)!`, isP1 ? 'p1' : 'p2');
                    renderSpectatorTrack();
                } else {
                    playSound('fail');
                    addMatchLog(`❌ ${player} отправляет задачу ${probId}: Wrong Answer на тесте ${Math.floor(Math.random()*12)+1}`, isP1 ? 'p1' : 'p2');
                }
            }
        }
    }, 5000);
}

function animateTokenPulse(tokenId) {
    const el = document.getElementById(tokenId);
    el.classList.add('token-pulse');
    setTimeout(() => el.classList.remove('token-pulse'), 600);
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}