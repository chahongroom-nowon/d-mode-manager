/* script.js - 휴무 토글 즉시 실행 (모달 삭제) 최종본 */

// --- 설정 및 상태 관리 ---
const CONFIG = {
    USE_SERVER: false, // 로컬 스토리지 전용
    ADMIN_PW: '1212'
};

let state = {
    employees: [],
    teams: [],
    vacations: [],
    breakRecords: [],
    currentDate: new Date()
};

// 확인 모달 콜백 저장용
let pendingConfirmAction = null;

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    
    // 투명 달력 날짜 동기화
    const realInput = document.getElementById('real-date-input');
    if(realInput) realInput.value = getFormatDate(state.currentDate);

    updateDateDisplay();
    setupEventListeners();
    renderAll();
});

// --- 데이터 로드 및 저장 ---
async function initDatabase() {
    const localData = localStorage.getItem('dModeData');
    if (localData) {
        const parsed = JSON.parse(localData);
        state.employees = parsed.employees || [];
        state.teams = parsed.teams || [];
        state.vacations = parsed.vacations || [];
        state.breakRecords = parsed.breakRecords || [];
    }

    if (CONFIG.USE_SERVER) {
        try {
            const response = await fetch('/api/data');
            if (response.ok) {
                const serverData = await response.json();
                if(serverData.lastUpdated > (JSON.parse(localData)?.lastUpdated || 0)) {
                    state = { ...state, ...serverData };
                }
            }
        } catch (e) {
            console.warn("서버 연결 안됨 (로컬 모드 동작)");
        }
    }
}

function saveData() {
    const dataToSave = {
        employees: state.employees,
        teams: state.teams,
        vacations: state.vacations,
        breakRecords: state.breakRecords,
        lastUpdated: Date.now()
    };
    localStorage.setItem('dModeData', JSON.stringify(dataToSave));

    if (CONFIG.USE_SERVER) {
        fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSave)
        }).catch(() => {});
    }
    
    renderAll();
}

// --- 유틸리티 함수 ---
function getFormatDate(date) {
    const offset = date.getTimezoneOffset() * 60000;
    const dateOffset = new Date(date.getTime() - offset);
    return dateOffset.toISOString().split('T')[0];
}

function getDisplayDate(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} (${days[date.getDay()]})`;
}

function updateDateDisplay() {
    document.getElementById('current-date').innerText = getDisplayDate(state.currentDate);
}

// 공통 확인 모달
function showConfirmModal(message, onConfirm) {
    document.getElementById('confirm-message').innerText = message;
    pendingConfirmAction = onConfirm;
    openModal(document.getElementById('confirm-modal'));
}

// --- 화면 렌더링 ---
function renderAll() {
    const container = document.getElementById('teams-container');
    container.innerHTML = '';

    const todayStr = getFormatDate(state.currentDate);
    const mmdd = todayStr.substring(5); // MM-DD
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][state.currentDate.getDay()] + '요일';

    const teamsMap = {};
    state.teams.forEach(t => teamsMap[t.name] = []);

    state.employees.forEach(emp => {
        if (emp.offDays && emp.offDays.includes(dayName)) return;
        const tName = emp.team || '미지정';
        if (!teamsMap[tName]) teamsMap[tName] = [];
        teamsMap[tName].push(emp);
    });

    const teamNames = Object.keys(teamsMap);
    
    if (teamNames.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-user-clock"></i><h3>등록된 팀이나 직원이 없습니다.</h3><p>우측 메뉴에서 직원을 추가해주세요.</p></div>`;
        return;
    }

    // 휴무자 정렬 (휴무인 사람은 맨 뒤로)
    teamNames.forEach(teamName => {
        teamsMap[teamName].sort((a, b) => {
            const isVacA = state.vacations.some(v => v.employeeId === a.id && v.date === mmdd);
            const isVacB = state.vacations.some(v => v.employeeId === b.id && v.date === mmdd);
            if (isVacA === isVacB) return 0;
            return isVacA ? 1 : -1;
        });
    });

    let hasActiveTeams = false;

    teamNames.forEach(teamName => {
        // 근무자가 없는 팀은 박스를 아예 그리지 않음
        if (teamsMap[teamName].length === 0) return;

        hasActiveTeams = true;

        const teamSection = document.createElement('div');
        teamSection.className = 'team-card';
        teamSection.innerHTML = `
            <div class="team-header">
                <span class="team-name">${teamName}</span>
                <button class="add-employee-btn" onclick="openAddModal('${teamName}')">+ 직원 추가</button>
            </div>
        `;
        
        const listContainer = document.createElement('div');
        teamsMap[teamName].forEach(emp => {
            listContainer.appendChild(createEmployeeCard(emp, todayStr));
        });
        
        teamSection.appendChild(listContainer);
        container.appendChild(teamSection);
    });

    if (!hasActiveTeams) {
         container.innerHTML = `<div class="empty-state"><i class="fas fa-coffee"></i><h3>오늘은 근무하는 팀이 없습니다.</h3><p>전체 휴무일이거나 등록된 근무자가 없습니다.</p></div>`;
    }
}

function createEmployeeCard(emp, todayStr) {
    const mmdd = todayStr.substring(5);
    const record = state.breakRecords.find(r => r.employeeId === emp.id && r.date === todayStr);
    const isVacation = state.vacations.some(v => v.employeeId === emp.id && v.date === mmdd);
    const card = document.createElement('div');
    
    let statusClass = 'working'; 
    let statusText = '배고파용 8ㅅ8'; 
    let btnHtml = `<button class="action-btn record-btn" onclick="handleRecord(${emp.id})">🍚 식사 시작</button>`;
    
    if (isVacation) {
        statusClass = 'vacation';
        statusText = '🏖️ 휴가핑 ٩( ᐛ )و';
        btnHtml = ''; 
    } else if (record) {
        if (record.breakDown && !record.breakUp) {
            statusClass = 'eating';
            statusText = `⏳ ${record.breakDown} 내려감`; 
            btnHtml = `
                <button class="action-btn record-btn end" onclick="handleRecord(${emp.id})">✅ 복귀</button>
                <button class="action-btn cancel-btn" onclick="handleCancel(${emp.id})" title="잘못 눌렀을 때 취소">❌ 취소</button>
            `;
        } else if (record.breakDown && record.breakUp) {
            statusClass = 'done';
            const start = new Date(`2000/01/01 ${record.breakDown}`);
            const end = new Date(`2000/01/01 ${record.breakUp}`);
            const diffMin = Math.round((end - start) / 1000 / 60);
            statusText = `✅ ${record.breakDown} ~ ${record.breakUp} <span style="color:#d6336c; font-weight:bold;">(${diffMin}분)</span>`;
            btnHtml = `<button class="action-btn cancel-btn" onclick="handleCancel(${emp.id})">기록 삭제</button>`;
        }
    }

    card.className = `employee-card ${statusClass}`;
    card.innerHTML = `
        <button class="vacation-btn ${isVacation ? 'active' : ''}" onclick="toggleVacation(${emp.id})" title="임시 휴무 토글">🏖️</button>
        <div class="employee-info">
            <div class="employee-name">${emp.name}</div>
            <div class="break-info">${statusText}</div>
        </div>
        <div class="employee-actions">
            ${btnHtml}
        </div>
    `;
    return card;
}

// --- 비즈니스 로직 ---
function handleRecord(empId) {
    const todayStr = getFormatDate(state.currentDate);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    let record = state.breakRecords.find(r => r.employeeId === empId && r.date === todayStr);

    if (!record) {
        state.breakRecords.push({ id: Date.now(), employeeId: empId, date: todayStr, breakDown: timeStr, breakUp: null });
    } else if (!record.breakUp) {
        record.breakUp = timeStr;
    } else {
        alert("이미 완료된 기록입니다.");
        return;
    }
    saveData();
}

function handleCancel(empId, skipConfirm = false) {
    const empName = state.employees.find(e => e.id === empId)?.name || '직원';
    const executeCancel = () => {
        const todayStr = getFormatDate(state.currentDate);
        state.breakRecords = state.breakRecords.filter(r => !(r.employeeId === empId && r.date === todayStr));
        saveData();
        closeModal(document.getElementById('confirm-modal'));
    };
    if (skipConfirm) executeCancel();
    else showConfirmModal(`'${empName}'님의 식사 기록을 초기화 하시겠습니까?`, executeCancel);
}

// [핵심 수정] 임시 휴무 토글 (확인창 없이 즉시 실행)
function toggleVacation(empId) {
    const todayStr = getFormatDate(state.currentDate);
    const mmdd = todayStr.substring(5);
    const idx = state.vacations.findIndex(v => v.employeeId === empId && v.date === mmdd);

    if (idx >= 0) {
        // 이미 휴무면 -> 해제 (즉시)
        state.vacations.splice(idx, 1);
    } else {
        // 휴무 아니면 -> 등록 (즉시)
        state.vacations.push({ id: Date.now(), employeeId: empId, date: mmdd });
    }
    
    // 저장 및 화면 갱신 (정렬 로직에 의해 자동으로 맨 뒤로 이동됨)
    saveData();
}

function openAddModal(teamName) {
    document.getElementById('employee-name').value = '';
    document.getElementById('employee-team').value = teamName || '';
    document.getElementById('employee-off-days').value = '';
    openModal(document.getElementById('add-employee-modal'));
}

function submitAddEmployee() {
    const name = document.getElementById('employee-name').value;
    const team = document.getElementById('employee-team').value;
    const offDays = document.getElementById('employee-off-days').value;
    if(name && team) {
        state.employees.push({ id: Date.now(), name, team, offDays });
        if(!state.teams.find(t => t.name === team)) state.teams.push({ name: team, offDays: '' });
        saveData();
        closeModal(document.getElementById('add-employee-modal'));
    } else {
        alert('이름과 팀을 입력해주세요.');
    }
}

function checkAdminPassword() {
    const pw = document.getElementById('password-input').value;
    if(pw === CONFIG.ADMIN_PW) {
        closeModal(document.getElementById('password-modal'));
        const select = document.getElementById('admin-employee-select');
        select.innerHTML = '<option value="">직원 선택</option>';
        state.employees.forEach(emp => select.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.team})</option>`);
        document.getElementById('admin-date').value = getFormatDate(state.currentDate);
        openModal(document.getElementById('admin-modal'));
        document.getElementById('password-input').value = ''; 
    } else {
        alert("비밀번호가 틀렸습니다.");
    }
}

function submitAdminRecord() {
    const empId = Number(document.getElementById('admin-employee-select').value);
    const date = document.getElementById('admin-date').value;
    const down = document.getElementById('admin-break-down').value;
    const up = document.getElementById('admin-break-up').value;

    if(!empId || !date) return alert("직원과 날짜는 필수입니다.");
    let record = state.breakRecords.find(r => r.employeeId === empId && r.date === date);
    if(record) {
        record.breakDown = down;
        record.breakUp = up;
    } else {
        state.breakRecords.push({ id: Date.now(), employeeId: empId, date: date, breakDown: down, breakUp: up });
    }
    saveData();
    closeModal(document.getElementById('admin-modal'));
    alert("수정되었습니다.");
}

function submitEditTeam() {
    const select = document.getElementById('edit-team-select');
    const oldName = select.value;
    const newName = document.getElementById('edit-team-name').value;
    if(oldName && newName) {
        const team = state.teams.find(t => t.name === oldName);
        if(team) {
            team.name = newName;
            state.employees.forEach(e => { if(e.team === oldName) e.team = newName; });
            saveData();
            closeModal(document.getElementById('edit-team-modal'));
        }
    }
}

function submitDeleteEmployee() {
    const empId = Number(document.getElementById('delete-employee-select').value);
    if(empId) {
        showConfirmModal("정말 이 직원을 삭제하시겠습니까? (기록도 함께 삭제될 수 있습니다)", () => {
            state.employees = state.employees.filter(e => e.id !== empId);
            saveData();
            closeModal(document.getElementById('confirm-modal'));
            closeModal(document.getElementById('delete-employee-modal'));
        });
    }
}

function submitEditEmployee() {
    const empId = Number(document.getElementById('edit-employee-select').value);
    const newName = document.getElementById('edit-employee-name').value;
    const newTeam = document.getElementById('edit-employee-team').value;
    const newOff = document.getElementById('edit-employee-off-days').value;
    if(empId && newName && newTeam) {
        const emp = state.employees.find(e => e.id === empId);
        if(emp) {
            emp.name = newName;
            emp.team = newTeam;
            emp.offDays = newOff;
            if(!state.teams.find(t => t.name === newTeam)) state.teams.push({ name: newTeam, offDays: '' });
            saveData();
            closeModal(document.getElementById('edit-employee-modal'));
        }
    }
}

// --- 알프레드 ---
const alfredModal = document.getElementById('alfred-modal');
const alfredInput = document.getElementById('alfred-input');

function toggleAlfred() {
    if (alfredModal.style.display === 'block') {
        alfredModal.style.display = 'none';
        alfredInput.value = ''; 
    } else {
        alfredModal.style.display = 'block';
        alfredInput.focus(); 
    }
}

if(alfredInput) {
    alfredInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const text = alfredInput.value.trim();
            if (text) runAlfredCommand(text);
            toggleAlfred(); 
        } else if (e.key === 'Escape') {
            toggleAlfred(); 
        }
    });
}

function runAlfredCommand(text) {
    const tokens = text.split(/\s+/);
    if (tokens.length === 0) return;
    const isCancelMode = tokens[tokens.length - 1] === '취소';
    const targetNames = isCancelMode ? tokens.slice(0, -1) : tokens;
    let notFoundNames = [];

    targetNames.forEach(name => {
        const emp = state.employees.find(e => e.name === name);
        if (emp) {
            if (isCancelMode) handleCancel(emp.id, true);
            else handleRecord(emp.id);
        } else {
            notFoundNames.push(name);
        }
    });
    if (notFoundNames.length > 0) console.log(`찾을 수 없는 이름: ${notFoundNames.join(', ')}`);
}

// 외부 신호(익스텐션) 받기
window.addEventListener('message', (event) => {
    if (event.data.type === 'TOGGLE_ALFRED') {
        toggleAlfred();
    }
});

// (테스트용 & 페이지 내부용) Ctrl + Space
document.addEventListener('keydown', (e) => {
    // Ctrl 키가 눌려있고, Shift 키는 안 눌려있고, Space 키를 눌렀을 때
    if (e.ctrlKey && !e.shiftKey && e.code === 'Space') {
        e.preventDefault(); // 스페이스바 눌렀을 때 스크롤 내려가는 것 방지
        toggleAlfred();
    }
});

// --- 이벤트 리스너 설정 ---
function setupEventListeners() {
    // 햄버거 메뉴
    const menu = document.getElementById('hamburger-menu');
    const overlay = document.getElementById('menu-overlay');
    const btn = document.getElementById('hamburger-btn');
    const toggleMenu = () => {
        menu.classList.toggle('active');
        overlay.classList.toggle('active');
        btn.classList.toggle('active');
    };
    btn.onclick = toggleMenu;
    document.getElementById('close-menu-btn').onclick = toggleMenu;
    overlay.onclick = toggleMenu;

    // 공통 확인 모달
    document.getElementById('confirm-yes-btn').onclick = () => {
        if (pendingConfirmAction) pendingConfirmAction();
        pendingConfirmAction = null;
    };
    document.getElementById('confirm-no-btn').onclick = () => {
        closeModal(document.getElementById('confirm-modal'));
        pendingConfirmAction = null;
    };

    // 모달 닫기
    document.querySelectorAll('.close-btn').forEach(b => {
        b.onclick = function() { this.closest('.modal').style.display = 'none'; }
    });

    // 날짜 선택 강제 실행
    const dateContainer = document.getElementById('date-container');
    const realDateInput = document.getElementById('real-date-input');

    if (dateContainer && realDateInput) {
        const openCalendar = (e) => {
            try { realDateInput.showPicker(); } 
            catch (err) { console.warn("브라우저가 showPicker 미지원"); }
        };
        dateContainer.onclick = openCalendar;
        realDateInput.onchange = (e) => {
            const val = e.target.value;
            if(val) {
                state.currentDate = new Date(val);
                updateDateDisplay();
                renderAll();
            }
        };
    }

    // 버튼 이벤트 연결
    document.getElementById('save-employee').onclick = submitAddEmployee;
    document.getElementById('add-junior-btn').onclick = () => { toggleMenu(); openAddModal(''); };
    document.getElementById('add-designer-btn').onclick = () => { toggleMenu(); openAddModal(''); };
    document.getElementById('edit-employee-btn').onclick = () => {
        toggleMenu();
        const select = document.getElementById('edit-employee-select');
        select.innerHTML = '<option value="">직원 선택</option>';
        state.employees.forEach(e => select.innerHTML += `<option value="${e.id}">${e.name}</option>`);
        openModal(document.getElementById('edit-employee-modal'));
    };
    document.getElementById('edit-employee-select').onchange = (e) => {
        const emp = state.employees.find(x => x.id == e.target.value);
        if(emp) {
            document.getElementById('edit-employee-name').value = emp.name;
            document.getElementById('edit-employee-team').value = emp.team;
            document.getElementById('edit-employee-off-days').value = emp.offDays || '';
        }
    };
    document.getElementById('update-employee').onclick = submitEditEmployee;
    document.getElementById('delete-employee-btn').onclick = () => {
        toggleMenu();
        const select = document.getElementById('delete-employee-select');
        select.innerHTML = '<option value="">직원 선택</option>';
        state.employees.forEach(e => select.innerHTML += `<option value="${e.id}">${e.name}</option>`);
        openModal(document.getElementById('delete-employee-modal'));
    };
    document.getElementById('confirm-delete-employee').onclick = submitDeleteEmployee;
    document.getElementById('edit-team-btn').onclick = () => {
        toggleMenu();
        const select = document.getElementById('edit-team-select');
        select.innerHTML = '<option value="">팀 선택</option>';
        state.teams.forEach(t => select.innerHTML += `<option value="${t.name}">${t.name}</option>`);
        openModal(document.getElementById('edit-team-modal'));
    };
    document.getElementById('update-team').onclick = submitEditTeam;

    document.getElementById('admin-btn').onclick = () => { toggleMenu(); openModal(document.getElementById('password-modal')); };
    document.getElementById('confirm-password').onclick = checkAdminPassword;
    document.getElementById('save-admin-record').onclick = submitAdminRecord;
    document.getElementById('add-vacation-btn').onclick = () => { toggleMenu(); alert("직원 카드 우측 상단의 🏖️ 버튼을 눌러주세요."); };
    document.getElementById('cancel-vacation-btn').onclick = () => { toggleMenu(); alert("휴무 상태인 직원 카드의 🏖️ 버튼을 다시 누르면 해제됩니다."); };
    document.getElementById('sales-btn').onclick = () => alert("준비중인 기능입니다.");
}

// 모달 유틸
function openModal(el) { if(el) el.style.display = 'block'; }
function closeModal(el) { if(el) el.style.display = 'none'; }