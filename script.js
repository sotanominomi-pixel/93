// --- 状態管理 ---
const MIN_N = 12;
const MAX_N = 48;
let currentN = 24; 
let isSecondsVisible = true; 
let currentLang = 'ja'; 
let currentDevice = 'pc'; // 改良点: PCかMobileかを保持

// プリセット・設定保存用
let isPresetFeatureEnabled = true;
const PRESET_TOGGLE_KEY = 'nClockPresetEnabled';
const SETTINGS_STORAGE_KEY = 'nClockSettings';
const PRESET_STORAGE_KEY = 'nClockPresets';
let presets = []; 

// アラーム・ストップウォッチ用
let alarms = []; 
let swStartTime = 0;
let swElapsedTime = 0;
let swTimerId = null;
let swLaps = [];

// PiP用Canvas
let pipCanvas = document.createElement('canvas');
pipCanvas.width = 300;
pipCanvas.height = 150;
let pipCtx = pipCanvas.getContext('2d');

const translations = {
    'ja': {
        'nav-clock': '時計', 'nav-stopwatch': 'SW', 'nav-alarm': 'アラーム', 'nav-settings': '設定',
        'privacy-title': 'プライバシーポリシー', 'privacy-ad': '広告の配信について', 'close': '閉じる',
        'device-select': '使用デバイス', 'pip-label': 'ピクチャインピクチャ', 'floating-label': 'フローティング表示'
    },
    'en': {
        'nav-clock': 'Clock', 'nav-stopwatch': 'SW', 'nav-alarm': 'Alarm', 'nav-settings': 'Settings',
        'privacy-title': 'Privacy Policy', 'privacy-ad': 'Advertising', 'close': 'Close',
        'device-select': 'Device', 'pip-label': 'Picture in Picture', 'floating-label': 'Floating Clock'
    }
};

// --- 時計計算ロジック ---
function calculateNTime(realTime) {
    const speedFactor = 24 / currentN; 
    const totalSecondsIn24h = (realTime / 1000) * speedFactor;
    const h = Math.floor((totalSecondsIn24h / 3600) % 24); 
    const m = Math.floor((totalSecondsIn24h % 3600) / 60);
    const s = Math.floor(totalSecondsIn24h % 60);
    return { h, m, s };
}

function updateClock() {
    const now = new Date();
    const realTimeOfDay = now.getTime() - new Date(now.toDateString()).getTime(); 
    const { h, m, s } = calculateNTime(realTimeOfDay); 
    
    const fH = String(h).padStart(2, '0');
    const fM = String(m).padStart(2, '0');
    const fS = String(s).padStart(2, '0');
    let timeString = isSecondsVisible ? `${fH}:${fM}:${fS}` : `${fH}:${fM}`;

    const clockDisplay = document.getElementById('n-clock-display');
    if (clockDisplay) clockDisplay.textContent = timeString;

    // 改良点: スマホ用フローティングUIの更新
    const floatingClock = document.getElementById('floating-clock-text');
    if (floatingClock) floatingClock.textContent = timeString;
    const floatingN = document.getElementById('floating-n-text');
    if (floatingN) floatingN.textContent = `N=${currentN}`;

    // PiP Canvas描画
    if (clockDisplay) {
        pipCtx.fillStyle = "white"; pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
        pipCtx.fillStyle = "black"; pipCtx.font = "bold 60px Roboto"; pipCtx.textAlign = "center"; pipCtx.textBaseline = "middle";
        pipCtx.fillText(timeString, pipCanvas.width/2, pipCanvas.height/2);
    }
    checkAlarms(h, m, s); 
}

// --- 保存・読み込みロジック (一語一句維持) ---
function saveAppSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        currentN, isSecondsVisible, currentLang, isPresetFeatureEnabled, currentDevice
    }));
}
function loadAppSettings() {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
        const data = JSON.parse(saved);
        currentN = data.currentN || 24;
        isSecondsVisible = data.isSecondsVisible !== undefined ? data.isSecondsVisible : true;
        currentLang = data.currentLang || 'ja';
        isPresetFeatureEnabled = data.isPresetFeatureEnabled !== undefined ? data.isPresetFeatureEnabled : true;
        currentDevice = data.currentDevice || 'pc';
    }
    const savedAlarms = localStorage.getItem('nClockAlarms');
    if (savedAlarms) alarms = JSON.parse(savedAlarms);
    const savedPresets = localStorage.getItem(PRESET_STORAGE_KEY);
    if (savedPresets) presets = JSON.parse(savedPresets);
}

// --- 改良点: PiP / フローティング制御 ---
async function handlePiPAction() {
    if (currentDevice === 'pc') {
        const video = document.getElementById('pip-video');
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                video.srcObject = pipCanvas.captureStream(10);
                video.play();
                await video.requestPictureInPicture();
            }
        } catch (e) { alert('PiP非対応か、ユーザー操作が必要です。'); }
    } else {
        document.getElementById('floating-pip-ui').style.display = 'flex';
    }
}

// --- 各モードのレンダリング (一語一句維持 & 改良) ---
function renderClockMode() {
    const btnLabel = currentDevice === 'pc' ? 
        (currentLang === 'ja' ? 'ピクチャインピクチャ' : 'Picture in Picture') : 
        (currentLang === 'ja' ? 'フローティング表示' : 'Floating Clock');

    document.getElementById('content-area').innerHTML = `
        <div class="mode-title">${currentLang === 'ja' ? '時計' : 'Clock'}</div>
        <div id="n-clock-display" class="clock-display">--:--</div>
        <div class="pip-button-container">
            <button id="pip-start-btn" class="action-button pip-btn">${btnLabel}</button>
        </div>
        <div class="control-panel">
            <label for="n-slider" style="font-weight: 700;">1日の時間 (N)</label>
            <input type="range" id="n-slider" min="${MIN_N}" max="${MAX_N}" value="${currentN}">
            <div id="n-value-display" style="text-align: center; font-weight: 700;">N = ${currentN}</div>
        </div>
        <div id="preset-area"></div>
    `;
    setupNControl();
    document.getElementById('pip-start-btn').onclick = handlePiPAction;
    if (isPresetFeatureEnabled) renderPresetArea();
}

function renderSettingsMode() {
    const t = translations[currentLang];
    document.getElementById('content-area').innerHTML = `
        <div class="mode-title">${t['nav-settings']}</div>
        <ul class="settings-list">
            <li>
                <span>${currentLang === 'ja' ? '秒数表示' : 'Show Seconds'}</span>
                <label class="toggle-switch"><input type="checkbox" id="seconds-toggle" ${isSecondsVisible?'checked':''}><span class="slider"></span></label>
            </li>
            <!-- 改良点: デバイス選択 -->
            <li>
                <span>${t['device-select']}</span>
                <div class="segmented-control" id="device-control">
                    <button data-val="pc" class="segment-button ${currentDevice === 'pc' ? 'active' : ''}">PC</button>
                    <button data-val="mobile" class="segment-button ${currentDevice === 'mobile' ? 'active' : ''}">Mobile</button>
                </div>
            </li>
            <li>
                <span>${currentLang === 'ja' ? '言語' : 'Lang'}</span>
                <div class="segmented-control" id="language-control">
                    <button data-lang="ja" class="segment-button ${currentLang === 'ja' ? 'active' : ''}">JP</button>
                    <button data-lang="en" class="segment-button ${currentLang === 'en' ? 'active' : ''}">EN</button>
                </div>
            </li>
            <li>
                <span>プリセット機能</span>
                <label class="toggle-switch"><input type="checkbox" id="preset-toggle" ${isPresetFeatureEnabled?'checked':''}><span class="slider"></span></label>
            </li>
        </ul>
    `;
    
    document.getElementById('seconds-toggle').onchange = (e) => { isSecondsVisible = e.target.checked; saveAppSettings(); };
    document.getElementById('preset-toggle').onchange = (e) => { isPresetFeatureEnabled = e.target.checked; saveAppSettings(); };
    document.getElementById('device-control').querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentDevice = btn.dataset.val; saveAppSettings(); renderSettingsMode(); };
    });
    document.getElementById('language-control').querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentLang = btn.dataset.lang; saveAppSettings(); renderSettingsMode(); updateTabBarText(); };
    });
}

// --- 共通初期化処理 ---
function setupNControl() {
    const slider = document.getElementById('n-slider');
    const display = document.getElementById('n-value-display');
    slider.oninput = (e) => {
        currentN = parseInt(e.target.value);
        display.textContent = `N = ${currentN}`;
        saveAppSettings();
        updateClock();
    };
}

// --- ストップウォッチ / アラーム / プリセット ロジック (一語一句維持) ---
function renderStopwatchMode() {
    document.getElementById('content-area').innerHTML = `
        <div class="mode-title">SW</div>
        <div id="sw-display" class="clock-display">00:00:00</div>
        <div class="stopwatch-controls">
            <button id="sw-lap-btn" class="rounded-square-btn control-button gray-btn">ラップ</button>
            <button id="sw-start-btn" class="rounded-square-btn control-button">開始</button>
        </div>
        <ul id="sw-laps" class="lap-list"></ul>
    `;
    const startBtn = document.getElementById('sw-start-btn');
    const lapBtn = document.getElementById('sw-lap-btn');
    const updateSWBtn = () => {
        if (swTimerId) { startBtn.textContent = '停止'; startBtn.classList.add('stop'); lapBtn.textContent = 'ラップ'; }
        else { startBtn.textContent = '開始'; startBtn.classList.remove('stop'); lapBtn.textContent = 'リセット'; }
    };
    updateSWBtn();
    renderLaps();
    startBtn.onclick = () => {
        if (swTimerId) { clearInterval(swTimerId); swTimerId = null; swElapsedTime += Date.now() - swStartTime; }
        else { swStartTime = Date.now(); swTimerId = setInterval(updateSW, 10); }
        updateSWBtn();
    };
    lapBtn.onclick = () => {
        if (swTimerId) { 
            const nowTime = swElapsedTime + (Date.now() - swStartTime);
            swLaps.unshift(formatSWTime(nowTime)); renderLaps();
        } else { swElapsedTime = 0; swLaps = []; renderLaps(); updateSW(); }
    };
}

function updateSW() {
    const elapsed = swTimerId ? swElapsedTime + (Date.now() - swStartTime) : swElapsedTime;
    const display = document.getElementById('sw-display');
    if (display) display.textContent = formatSWTime(elapsed);
}

function formatSWTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
    return `${h}:${m}:${s}.${cs}`;
}

function renderLaps() {
    const list = document.getElementById('sw-laps');
    if (list) list.innerHTML = swLaps.map((l, i) => `<li>ラップ ${swLaps.length - i}: ${l}</li>`).join('');
}

function renderAlarmMode() {
    document.getElementById('content-area').innerHTML = `
        <div class="mode-title">${currentLang==='ja'?'アラーム':'Alarm'}</div>
        <div id="alarm-list"></div>
        <button class="accordion-header" id="add-alarm-accordion">
            <span>新しいアラーム</span><span class="accordion-icon">▼</span>
        </button>
        <div class="accordion-content" id="add-alarm-content">
            <div style="display:flex; justify-content:center; align-items:center; margin-top:10px;">
                <select id="alarm-h" class="time-select">${[...Array(24).keys()].map(i=>`<option value="${i}">${String(i).padStart(2,'0')}</option>`).join('')}</select>:
                <select id="alarm-m" class="time-select">${[...Array(60).keys()].map(i=>`<option value="${i}">${String(i).padStart(2,'0')}</option>`).join('')}</select>
                <button id="add-alarm-btn" class="action-button save-btn">保存</button>
            </div>
        </div>
    `;
    renderAlarms();
    const header = document.getElementById('add-alarm-accordion');
    header.onclick = () => {
        header.classList.toggle('active');
        document.getElementById('add-alarm-content').classList.toggle('open');
    };
    document.getElementById('add-alarm-btn').onclick = () => {
        const h = parseInt(document.getElementById('alarm-h').value);
        const m = parseInt(document.getElementById('alarm-m').value);
        alarms.push({ h, m, enabled: true });
        localStorage.setItem('nClockAlarms', JSON.stringify(alarms));
        renderAlarms();
    };
}

function renderAlarms() {
    const list = document.getElementById('alarm-list');
    if (!list) return;
    list.innerHTML = alarms.map((a, i) => `
        <div class="alarm-item">
            <span class="alarm-time">${String(a.h).padStart(2,'0')}:${String(a.m).padStart(2,'0')}</span>
            <label class="toggle-switch"><input type="checkbox" onchange="toggleAlarm(${i})" ${a.enabled?'checked':''}><span class="slider"></span></label>
            <button onclick="deleteAlarm(${i})" class="delete-preset-btn">削除</button>
        </div>
    `).join('');
}

function toggleAlarm(i) { alarms[i].enabled = !alarms[i].enabled; localStorage.setItem('nClockAlarms', JSON.stringify(alarms)); }
function deleteAlarm(i) { alarms.splice(i, 1); localStorage.setItem('nClockAlarms', JSON.stringify(alarms)); renderAlarms(); }

function checkAlarms(h, m, s) {
    if (s !== 0) return;
    alarms.forEach(a => { if (a.enabled && a.h === h && a.m === m) alert(`アラーム！ ${h}:${m}`); });
}

function renderPresetArea() {
    const area = document.getElementById('preset-area');
    if (!area) return;
    area.innerHTML = `
        <div class="preset-container">
            <div class="preset-header"><h3>プリセット</h3><button class="save-preset-btn" id="save-p-btn">現在を保存</button></div>
            <ul class="preset-list" id="p-list"></ul>
        </div>
    `;
    renderPresetList();
    document.getElementById('save-p-btn').onclick = () => {
        const name = prompt("名前を入力", `設定 ${presets.length + 1}`);
        if (name) { presets.push({ name, n: currentN }); localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets)); renderPresetList(); }
    };
}

function renderPresetList() {
    const list = document.getElementById('p-list');
    if (!list) return;
    list.innerHTML = presets.map((p, i) => `
        <li class="preset-item" onclick="applyPreset(${p.n})">
            <span class="preset-name">${p.name}</span><span class="preset-value">N=${p.n}</span>
            <button class="delete-preset-btn" onclick="event.stopPropagation(); deletePreset(${i})">削除</button>
        </li>
    `).join('');
}

function applyPreset(n) { currentN = n; saveAppSettings(); renderClockMode(); updateClock(); }
function deletePreset(i) { presets.splice(i, 1); localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets)); renderPresetList(); }

// --- アプリ初期化 ---
function initApp() {
    loadAppSettings();
    setInterval(updateClock, 100);
    document.getElementById('close-floating-btn').onclick = () => {
        document.getElementById('floating-pip-ui').style.display = 'none';
    };
    document.querySelectorAll('.tab-item').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-item').forEach(btn => btn.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderCurrentMode();
        });
    });
    renderClockMode();
}

function renderCurrentMode() {
    const id = document.querySelector('.tab-item.active').id;
    if (id === 'nav-clock') renderClockMode();
    else if (id === 'nav-stopwatch') renderStopwatchMode();
    else if (id === 'nav-alarm') renderAlarmMode();
    else if (id === 'nav-settings') renderSettingsMode();
}

function updateTabBarText() {
    document.querySelectorAll('.tab-item').forEach(btn => {
        const label = btn.querySelector('.label');
        if (label) label.textContent = translations[currentLang][btn.id];
    });
}

document.addEventListener('DOMContentLoaded', initApp);
