/* ==========================================================================
   LEDGER — Goal Planner
   Vanilla JS application. State lives in one object, persisted to
   localStorage. Each view has a render function that rebuilds its section
   from current state — simple, predictable, no virtual DOM needed at
   this scale.
   ========================================================================== */

/* ---------------------------------- CONSTANTS ---------------------------------- */
const STORAGE_KEY = 'ledger_planner_v1';
const CATEGORIES = ['IELTS', 'Programming', 'Math', 'Gym', 'Reading', 'Business', 'Languages', 'Other'];
const PRIORITIES = ['low', 'medium', 'high'];
const QUOTES = [
  'Discipline is choosing what you want most over what you want now.',
  'Small daily improvements lead to staggering long-term results.',
  'You do not rise to the level of your goals, you fall to the level of your systems.',
  'The pain of discipline weighs ounces; the pain of regret weighs tons.',
  'A goal without a plan is just a wish.',
  'Progress, not perfection.',
  'Consistency is what transforms average into excellence.',
  'The expert in anything was once a beginner who kept showing up.',
  'Focus on the step in front of you, not the whole staircase.',
  'What you do today can improve all your tomorrows.',
  'Success is the sum of small efforts repeated daily.',
  'Motivation gets you started. Habit keeps you going.',
];

/* ---------------------------------- STATE ---------------------------------- */
let state = loadState();

function defaultState(){
  return {
    goals: [],
    tasks: [],
    habits: [],
    notes: [],
    xp: 0,
    settings: { theme: 'dark', accent: 'gold', fontSize: 1, animSpeed: 1, language: 'en', pomodoroWork: 25, pomodoroBreak: 5 },
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...(parsed.settings||{}) } };
  }catch(e){
    console.warn('Could not load saved data, starting fresh.', e);
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------------------------- UTILITIES ---------------------------------- */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function todayStr(){ return dateToStr(new Date()); }
function dateToStr(d){ return d.toISOString().slice(0,10); }
function addDays(dateStr, n){ const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate()+n); return dateToStr(d); }
function daysDiff(a,b){ return Math.round((new Date(a) - new Date(b)) / 86400000); }
function fmtDate(dateStr){
  if(!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
}
function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }

/* ---------------------------------- XP / LEVEL ---------------------------------- */
function addXp(amount){
  state.xp = Math.max(0, state.xp + amount);
  saveState();
  renderXp();
}
function levelInfo(){
  const level = Math.floor(state.xp / 100) + 1;
  const into = state.xp % 100;
  return { level, into, need: 100 };
}
function renderXp(){
  const { level, into, need } = levelInfo();
  $('#levelNum').textContent = level;
  $('#levelNumText').textContent = level;
  $('#xpText').textContent = `${into} / ${need} XP`;
  const circumference = 163;
  const offset = circumference - (into/need)*circumference;
  $('#xpRingFill').style.strokeDashoffset = offset;
}

/* ---------------------------------- TOAST & CONFETTI ---------------------------------- */
let toastTimer = null;
function showToast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.hidden = true; }, 2600);
}

function confettiBurst(){
  const canvas = $('#confettiCanvas');
  canvas.width = innerWidth; canvas.height = innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#c9a227','#3c8272','#b5564d','#ece9e2'];
  const particles = Array.from({length:120}, () => ({
    x: innerWidth/2, y: innerHeight/2,
    vx: (Math.random()-0.5)*14, vy: (Math.random()-0.5)*14 - 4,
    size: Math.random()*6+3, color: colors[Math.floor(Math.random()*colors.length)],
    life: 60 + Math.random()*30, rot: Math.random()*360,
  }));
  let frame = 0;
  function tick(){
    frame++;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.rot += 6;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
    });
    if(frame < 90) requestAnimationFrame(tick);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  tick();
}

/* ---------------------------------- MODAL SYSTEM ---------------------------------- */
function openModal(html, onOpen){
  $('#modal').innerHTML = html;
  $('#modalOverlay').hidden = false;
  if(onOpen) onOpen($('#modal'));
}
function closeModal(){
  $('#modalOverlay').hidden = true;
  $('#modal').innerHTML = '';
}
$('#modalOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'modalOverlay') closeModal(); });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeModal(); });

/* ---------------------------------- CONFIRM-DELETE DIALOG ---------------------------------- */
function confirmDelete(label, onConfirm){
  openModal(`
    <h3>Delete ${escapeHtml(label)}?</h3>
    <p style="color:var(--text-muted); font-size:13.5px;">This action can't be undone. Are you sure you want to remove it?</p>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="cancelDeleteBtn">Cancel</button>
      <button type="button" class="btn btn-danger" id="confirmDeleteBtn">Delete</button>
    </div>
  `, (modal) => {
    $('#cancelDeleteBtn', modal).addEventListener('click', closeModal);
    $('#confirmDeleteBtn', modal).addEventListener('click', () => { closeModal(); onConfirm(); });
  });
}

/* ---------------------------------- ACTION MENU (⋮ dropdown) ----------------------------------
   One reusable dropdown, shared by Goals/Tasks/Habits/Notes. A single instance is created on
   demand and destroyed on close, so no per-item listeners are ever attached — every trigger and
   every menu item is handled through document-level event delegation. ------------------------- */
let activeMenu = null; // { entity, id, triggerEl, menuEl }

const MENU_BUILDERS = {
  goal(id){
    const goal = state.goals.find(g => g.id === id);
    if(!goal) return null;
    const items = [];
    if(!goal.completed) items.push({ act:'complete', label:'✓ Mark complete' });
    items.push({ act:'edit', label:'Edit' });
    items.push({ act:'delete', label:'Delete', danger:true });
    return { items, name: goal.title };
  },
  task(id){
    const task = state.tasks.find(t => t.id === id);
    if(!task) return null;
    return { items: [{ act:'edit', label:'Edit' }, { act:'delete', label:'Delete', danger:true }], name: task.title };
  },
  habit(id){
    const habit = state.habits.find(h => h.id === id);
    if(!habit) return null;
    return { items: [{ act:'delete', label:'Delete', danger:true }], name: habit.title };
  },
  note(id){
    const note = state.notes.find(n => n.id === id);
    if(!note) return null;
    return { items: [{ act:'delete', label:'Delete', danger:true }], name: 'this note' };
  },
};

const MENU_ACTIONS = {
  goal(id, act){
    const goal = state.goals.find(g => g.id === id); if(!goal) return;
    if(act === 'edit') openGoalModal(goal);
    else if(act === 'complete') completeGoal(goal);
    else if(act === 'delete') confirmDelete(goal.title, () => deleteGoal(id));
  },
  task(id, act){
    const task = state.tasks.find(t => t.id === id); if(!task) return;
    if(act === 'edit') openTaskModal(task);
    else if(act === 'delete') confirmDelete(task.title, () => deleteTask(id));
  },
  habit(id, act){
    const habit = state.habits.find(h => h.id === id); if(!habit) return;
    if(act === 'delete') confirmDelete(habit.title, () => {
      state.habits = state.habits.filter(h => h.id !== id);
      saveState(); renderHabits();
    });
  },
  note(id, act){
    if(act === 'delete') confirmDelete('this note', () => {
      state.notes = state.notes.filter(n => n.id !== id);
      saveState(); renderNotes();
    });
  },
};

function closeActionMenu(){
  if(!activeMenu) return;
  const { triggerEl, menuEl } = activeMenu;
  triggerEl.setAttribute('aria-expanded', 'false');
  menuEl.remove();
  activeMenu = null;
}

function positionActionMenu(triggerEl, menuEl){
  const rect = triggerEl.getBoundingClientRect();
  const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  const pad = 8;
  let left = rect.right - mw;
  let top = rect.bottom + 6;
  if(left < pad) left = rect.left;
  if(left + mw > innerWidth - pad) left = innerWidth - mw - pad;
  if(left < pad) left = pad;
  if(top + mh > innerHeight - pad) top = rect.top - mh - 6;
  if(top < pad) top = pad;
  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;
}

function openActionMenu(triggerEl){
  const entity = triggerEl.dataset.entity;
  const id = triggerEl.dataset.id;
  const builder = MENU_BUILDERS[entity];
  const data = builder ? builder(id) : null;
  if(!data) return;

  const menuEl = document.createElement('div');
  menuEl.className = 'action-menu';
  menuEl.setAttribute('role', 'menu');
  menuEl.setAttribute('aria-label', `Actions for ${data.name}`);
  menuEl.innerHTML = data.items.map(it => `<button type="button" role="menuitem" class="action-menu-item ${it.danger?'is-danger':''}" data-act="${it.act}">${it.label}</button>`).join('');
  document.body.appendChild(menuEl);

  triggerEl.setAttribute('aria-expanded', 'true');
  activeMenu = { entity, id, triggerEl, menuEl };

  positionActionMenu(triggerEl, menuEl);
  requestAnimationFrame(() => menuEl.classList.add('is-open'));

  const first = $('.action-menu-item', menuEl);
  if(first) first.focus();
}

// Single delegated click handler drives every trigger + every menu item in the app.
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.menu-trigger');
  if(trigger){
    e.stopPropagation();
    const reopening = activeMenu && activeMenu.triggerEl === trigger;
    closeActionMenu();
    if(!reopening) openActionMenu(trigger);
    return;
  }
  const item = e.target.closest('.action-menu-item');
  if(item && activeMenu){
    const { entity, id } = activeMenu;
    const act = item.dataset.act;
    closeActionMenu();
    const handler = MENU_ACTIONS[entity];
    if(handler) handler(id, act);
    return;
  }
  if(activeMenu && !e.target.closest('.action-menu')) closeActionMenu();
});

document.addEventListener('keydown', (e) => {
  if(!activeMenu) return;
  const items = $all('.action-menu-item', activeMenu.menuEl);
  const idx = items.indexOf(document.activeElement);
  if(e.key === 'Escape'){
    e.preventDefault();
    const trigger = activeMenu.triggerEl;
    closeActionMenu();
    trigger.focus();
  } else if(e.key === 'ArrowDown'){
    e.preventDefault(); items[(idx+1) % items.length]?.focus();
  } else if(e.key === 'ArrowUp'){
    e.preventDefault(); items[(idx-1+items.length) % items.length]?.focus();
  } else if(e.key === 'Tab'){
    closeActionMenu();
  }
}, true);

window.addEventListener('resize', () => { if(activeMenu) closeActionMenu(); });
window.addEventListener('scroll', () => { if(activeMenu) closeActionMenu(); }, true);

/* ---------------------------------- NAVIGATION ---------------------------------- */
const VIEWS = ['dashboard','goals','tasks','habits','calendar','stats','notes','timer','settings'];
let currentView = 'dashboard';

function switchView(view){
  currentView = view;
  VIEWS.forEach(v => {
    $(`#view-${v}`).hidden = v !== view;
  });
  $all('.nav-item').forEach(btn => {
    const active = btn.dataset.view === view;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active);
  });
  renderView(view);
  $('#sidebar').classList.remove('is-open');
}

function renderView(view){
  switch(view){
    case 'dashboard': renderDashboard(); break;
    case 'goals': renderGoals(); break;
    case 'tasks': renderTasks(); break;
    case 'habits': renderHabits(); break;
    case 'calendar': renderCalendar(); break;
    case 'stats': renderStats(); break;
    case 'notes': renderNotes(); break;
    case 'timer': renderTimer(); break;
    case 'settings': renderSettings(); break;
  }
}

$all('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
$('#mobileToggle').addEventListener('click', () => $('#sidebar').classList.toggle('is-open'));

/* ================================================================
   DASHBOARD
   ================================================================ */
function renderDashboard(){
  const root = $('#view-dashboard');
  const activeGoal = state.goals.find(g => !g.completed);
  const totalTasks = state.tasks.length;
  const doneTasks = state.tasks.filter(t => t.completed).length;
  const overallPct = totalTasks ? Math.round(doneTasks/totalTasks*100) : 0;

  const today = todayStr();
  const todaysTasks = state.tasks.filter(t => t.deadline === today);

  const streak = habitOverallStreak();
  const weekPct = periodCompletionPct(6);
  const monthPct = periodCompletionPct(29);

  const productivity = computeProductivityScore();

  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Overview</span><h2>Dashboard</h2></div>
      <div class="stitched"></div>
      <button class="btn btn-primary" id="quickAddTaskBtn">+ Quick task</button>
    </div>

    <div class="grid cols-4" style="margin-bottom:18px;">
      <div class="card stat-card hoverable">
        <span class="stat-label">Current goal</span>
        <span class="stat-value" style="font-size:19px;">${activeGoal ? escapeHtml(activeGoal.title) : 'No active goal'}</span>
        <span class="stat-sub">${activeGoal ? 'Deadline ' + fmtDate(activeGoal.deadline) : 'Create your first goal'}</span>
      </div>
      <div class="card stat-card hoverable">
        <span class="stat-label">Overall progress</span>
        <span class="stat-value">${overallPct}%</span>
        <div class="progress-track"><div class="progress-fill" style="width:${overallPct}%"></div></div>
      </div>
      <div class="card stat-card hoverable">
        <span class="stat-label">Current streak</span>
        <span class="stat-value">${streak} 🔥</span>
        <span class="stat-sub">days of habits completed</span>
      </div>
      <div class="card stat-card hoverable">
        <span class="stat-label">Productivity score</span>
        <span class="stat-value">${productivity}</span>
        <span class="stat-sub">based on last 7 days</span>
      </div>
    </div>

    <div class="grid cols-3" style="margin-bottom:18px;">
      <div class="card hoverable">
        <span class="stat-label">Today's tasks (${todaysTasks.length})</span>
        <div id="dashTodayList" style="margin-top:10px;">
          ${todaysTasks.length ? todaysTasks.map(taskRowHtml).join('') : emptyHtml('Nothing due today', 'Enjoy the calm, or get ahead of tomorrow.')}
        </div>
      </div>
      <div class="card stat-card hoverable">
        <span class="stat-label">Weekly progress</span>
        <span class="stat-value">${weekPct}%</span>
        <div class="progress-track"><div class="progress-fill" style="width:${weekPct}%"></div></div>
        <span class="stat-sub">tasks completed, last 7 days</span>
      </div>
      <div class="card stat-card hoverable">
        <span class="stat-label">Monthly progress</span>
        <span class="stat-value">${monthPct}%</span>
        <div class="progress-track"><div class="progress-fill" style="width:${monthPct}%"></div></div>
        <span class="stat-sub">tasks completed, last 30 days</span>
      </div>
    </div>

    <div class="card">
      <span class="stat-label">Motivation</span>
      <p style="font-family:var(--font-display); font-size:19px; font-style:italic; margin-top:10px;">"${QUOTES[Math.floor(Math.random()*QUOTES.length)]}"</p>
    </div>
  `;

  $('#dashTodayList').addEventListener('click', handleRowClick);
  $('#quickAddTaskBtn').addEventListener('click', () => openTaskModal());
}

function computeProductivityScore(){
  // simple heuristic: tasks completed in last 7 days * 8, plus habit streak * 3, capped at 100
  const weekDone = state.tasks.filter(t => t.completed && t.deadline && daysDiff(todayStr(), t.deadline) <= 0 && daysDiff(todayStr(), t.deadline) > -7).length;
  const streak = habitOverallStreak();
  return Math.min(100, weekDone*8 + streak*3);
}

function periodCompletionPct(daysBack){
  const from = addDays(todayStr(), -daysBack);
  const relevant = state.tasks.filter(t => t.deadline && t.deadline >= from && t.deadline <= todayStr());
  if(!relevant.length) return 0;
  const done = relevant.filter(t => t.completed).length;
  return Math.round(done/relevant.length*100);
}

/* ================================================================
   GOALS
   ================================================================ */
function renderGoals(){
  const root = $('#view-goals');
  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Long-term</span><h2>Goals</h2></div>
      <div class="stitched"></div>
      <button class="btn btn-primary" id="addGoalBtn">+ New goal</button>
    </div>
    <div class="grid cols-3" id="goalsGrid"></div>
  `;
  $('#addGoalBtn').addEventListener('click', () => openGoalModal());

  const grid = $('#goalsGrid');
  if(!state.goals.length){
    grid.innerHTML = emptyHtml('No goals yet', 'Start your ledger with something worth pursuing.');
    return;
  }
  grid.innerHTML = state.goals.map(goalCardHtml).join('');
}

function goalProgress(goal){
  const tasks = state.tasks.filter(t => t.goalId === goal.id);
  if(!tasks.length) return goal.completed ? 100 : 0;
  const done = tasks.filter(t => t.completed).length;
  return Math.round(done/tasks.length*100);
}

function goalCardHtml(goal){
  const pct = goalProgress(goal);
  const circumference = 2 * Math.PI * 33;
  const offset = circumference - (pct/100)*circumference;
  const overdue = goal.deadline && !goal.completed && daysDiff(goal.deadline, todayStr()) < 0;
  return `
  <div class="card hoverable" data-id="${goal.id}">
    <div style="display:flex; gap:14px; align-items:center;">
      <div class="seal">
        <svg viewBox="0 0 72 72"><circle class="track" cx="36" cy="36" r="33"/><circle class="fill" cx="36" cy="36" r="33"
          style="stroke-dasharray:${circumference}; stroke-dashoffset:${offset}"/></svg>
        <div class="seal-label">${pct}%</div>
      </div>
      <div style="flex:1; min-width:0;">
        <h3 style="font-size:16px; margin-bottom:4px;">${escapeHtml(goal.title)}</h3>
        <div class="row-meta">
          <span class="chip chip-cat">${escapeHtml(goal.category)}</span>
          ${goal.completed ? '<span class="chip chip-done">Completed</span>' : overdue ? '<span class="chip chip-overdue">Overdue</span>' : `<span>Due ${fmtDate(goal.deadline)}</span>`}
        </div>
      </div>
    </div>
    ${goal.notes ? `<p style="margin-top:12px; font-size:13px; color:var(--text-muted);">${escapeHtml(goal.notes)}</p>` : ''}
    <div class="row-actions" style="margin-top:14px; justify-content:flex-end;">
      <button class="menu-trigger" data-entity="goal" data-id="${goal.id}" aria-haspopup="true" aria-expanded="false" aria-label="More actions for ${escapeHtml(goal.title)}" title="More actions">⋮</button>
    </div>
  </div>`;
}

function completeGoal(goal){
  goal.completed = true;
  if(!goal.rewardClaimed){
    goal.rewardClaimed = true;
    addXp(50);
    showToast(`Goal completed: ${goal.title} (+50 XP)`);
    confettiBurst();
  }
  saveState();
  renderGoals();
}

function deleteGoal(id){
  state.goals = state.goals.filter(g => g.id !== id);
  state.tasks.forEach(t => { if(t.goalId === id) t.goalId = null; });
  saveState();
  renderGoals();
}

function openGoalModal(goal){
  const editing = !!goal;
  openModal(`
    <h3>${editing ? 'Edit goal' : 'New goal'}</h3>
    <form id="goalForm">
      <div class="field"><label>Title</label><input name="title" required value="${goal ? escapeHtml(goal.title) : ''}"></div>
      <div class="field-row">
        <div class="field"><label>Category</label>
          <select name="category">${CATEGORIES.map(c => `<option ${goal && goal.category===c?'selected':''}>${c}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Deadline</label><input type="date" name="deadline" value="${goal ? goal.deadline||'' : ''}"></div>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes">${goal ? escapeHtml(goal.notes||'') : ''}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Save changes' : 'Create goal'}</button>
      </div>
    </form>
  `, (modal) => {
    $('#cancelBtn', modal).addEventListener('click', closeModal);
    $('#goalForm', modal).addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if(editing){
        goal.title = fd.get('title'); goal.category = fd.get('category');
        goal.deadline = fd.get('deadline'); goal.notes = fd.get('notes');
      }else{
        state.goals.push({ id: uid(), title: fd.get('title'), category: fd.get('category'), deadline: fd.get('deadline'), notes: fd.get('notes'), completed:false, createdAt: todayStr() });
      }
      saveState(); closeModal(); renderGoals();
    });
  });
}

/* ================================================================
   TASKS
   ================================================================ */
let taskFilter = 'all';

function renderTasks(){
  const root = $('#view-tasks');
  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Execution</span><h2>Tasks</h2></div>
      <div class="stitched"></div>
      <button class="btn btn-primary" id="addTaskBtn">+ New task</button>
    </div>
    <div class="filter-bar" id="taskFilters">
      ${['all','incomplete','completed','today','tomorrow','week','high'].map(f => `<button class="filter-pill ${taskFilter===f?'is-active':''}" data-filter="${f}">${filterLabel(f)}</button>`).join('')}
    </div>
    <div class="card" id="taskList"></div>
  `;
  $('#addTaskBtn').addEventListener('click', () => openTaskModal());
  $('#taskFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]'); if(!btn) return;
    taskFilter = btn.dataset.filter; renderTasks();
  });
  const list = $('#taskList');
  const tasks = filterTasks(taskFilter);
  list.innerHTML = tasks.length ? tasks.map(taskRowHtml).join('') : emptyHtml('No tasks here', 'Try a different filter, or add a new task.');
  list.addEventListener('click', handleRowClick);
}

function filterLabel(f){
  return { all:'All', incomplete:'Incomplete', completed:'Completed', today:'Today', tomorrow:'Tomorrow', week:'This week', high:'High priority' }[f];
}

function filterTasks(f){
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  let list = [...state.tasks];
  if(f === 'incomplete') list = list.filter(t => !t.completed);
  if(f === 'completed') list = list.filter(t => t.completed);
  if(f === 'today') list = list.filter(t => t.deadline === today);
  if(f === 'tomorrow') list = list.filter(t => t.deadline === tomorrow);
  if(f === 'week') list = list.filter(t => t.deadline && t.deadline >= today && t.deadline <= weekEnd);
  if(f === 'high') list = list.filter(t => t.priority === 'high');
  return list.sort((a,b) => (a.deadline||'9999').localeCompare(b.deadline||'9999'));
}

function taskRowHtml(t){
  const overdue = t.deadline && !t.completed && daysDiff(t.deadline, todayStr()) < 0;
  const goal = state.goals.find(g => g.id === t.goalId);
  return `
  <div class="row" data-id="${t.id}" data-type="task">
    <button class="row-check ${t.completed?'checked':''}" data-act="toggle" aria-label="Toggle complete">${t.completed?'✓':''}</button>
    <div class="row-main">
      <div class="row-title ${t.completed?'done':''}">${escapeHtml(t.title)}</div>
      <div class="row-meta">
        <span class="chip chip-${t.priority}">${t.priority}</span>
        <span class="chip chip-cat">${escapeHtml(t.category||'Other')}</span>
        ${goal ? `<span>↳ ${escapeHtml(goal.title)}</span>` : ''}
        ${t.deadline ? `<span>${overdue ? '⚠ Overdue ' : ''}${fmtDate(t.deadline)}</span>` : ''}
        ${t.duration ? `<span>${t.duration} min</span>` : ''}
      </div>
    </div>
    <div class="row-actions">
      <button class="menu-trigger" data-entity="task" data-id="${t.id}" aria-haspopup="true" aria-expanded="false" aria-label="More actions for ${escapeHtml(t.title)}" title="More actions">⋮</button>
    </div>
  </div>`;
}

function handleRowClick(e){
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const row = e.target.closest('[data-id]');
  const id = row.dataset.id;
  const task = state.tasks.find(t => t.id === id);
  if(!task) return;
  if(btn.dataset.act === 'toggle') toggleTask(task);
}

function toggleTask(task){
  task.completed = !task.completed;
  if(task.completed && !task.rewardClaimed){
    task.rewardClaimed = true;
    addXp(10);
    showToast('Task completed (+10 XP)');
  } else if(task.completed){
    showToast('Task completed');
  }
  saveState();
  renderView(currentView);
  renderXp();
}

function deleteTask(id){
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState(); renderView(currentView);
}

function openTaskModal(task){
  const editing = !!task;
  openModal(`
    <h3>${editing ? 'Edit task' : 'New task'}</h3>
    <form id="taskForm">
      <div class="field"><label>Title</label><input name="title" required value="${task?escapeHtml(task.title):''}"></div>
      <div class="field"><label>Description</label><textarea name="description">${task?escapeHtml(task.description||''):''}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Priority</label>
          <select name="priority">${PRIORITIES.map(p => `<option ${task&&task.priority===p?'selected':''}>${p}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Category</label>
          <select name="category">${CATEGORIES.map(c => `<option ${task&&task.category===c?'selected':''}>${c}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Deadline</label><input type="date" name="deadline" value="${task?task.deadline||'':''}"></div>
        <div class="field"><label>Duration (min)</label><input type="number" min="0" name="duration" value="${task?task.duration||'':''}"></div>
      </div>
      <div class="field"><label>Linked goal</label>
        <select name="goalId"><option value="">None</option>${state.goals.map(g => `<option value="${g.id}" ${task&&task.goalId===g.id?'selected':''}>${escapeHtml(g.title)}</option>`).join('')}</select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn btn-primary">${editing?'Save changes':'Create task'}</button>
      </div>
    </form>
  `, (modal) => {
    $('#cancelBtn', modal).addEventListener('click', closeModal);
    $('#taskForm', modal).addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = { title: fd.get('title'), description: fd.get('description'), priority: fd.get('priority'),
        category: fd.get('category'), deadline: fd.get('deadline'), duration: Number(fd.get('duration'))||0, goalId: fd.get('goalId')||null };
      if(editing) Object.assign(task, data);
      else state.tasks.push({ id: uid(), completed:false, ...data });
      saveState(); closeModal(); renderView(currentView);
    });
  });
}

/* ================================================================
   HABITS
   ================================================================ */
function renderHabits(){
  const root = $('#view-habits');
  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Daily rituals</span><h2>Habits</h2></div>
      <div class="stitched"></div>
      <button class="btn btn-primary" id="addHabitBtn">+ New habit</button>
    </div>
    <div class="card" id="habitList"></div>
  `;
  $('#addHabitBtn').addEventListener('click', () => openHabitModal());
  const list = $('#habitList');
  list.innerHTML = state.habits.length ? state.habits.map(habitRowHtml).join('') : emptyHtml('No habits yet', 'Add a small daily ritual to build momentum.');
  list.addEventListener('click', handleHabitClick);
}

function habitStreak(habit){
  let streak = 0;
  let d = todayStr();
  while(habit.log[d]){ streak++; d = addDays(d, -1); }
  return streak;
}
function habitOverallStreak(){
  if(!state.habits.length) return 0;
  return Math.max(...state.habits.map(habitStreak), 0);
}

function habitRowHtml(h){
  const done = !!h.log[todayStr()];
  const streak = habitStreak(h);
  return `
  <div class="row" data-id="${h.id}">
    <button class="row-check ${done?'checked':''}" data-act="toggle" aria-label="Toggle today">${done?'✓':''}</button>
    <div class="row-main">
      <div class="row-title">${escapeHtml(h.title)}</div>
      <div class="row-meta"><span class="chip chip-cat">${escapeHtml(h.category||'Other')}</span><span>🔥 ${streak} day streak</span></div>
    </div>
    <div class="row-actions">
      <button class="menu-trigger" data-entity="habit" data-id="${h.id}" aria-haspopup="true" aria-expanded="false" aria-label="More actions for ${escapeHtml(h.title)}" title="More actions">⋮</button>
    </div>
  </div>`;
}

function handleHabitClick(e){
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const row = e.target.closest('[data-id]');
  const habit = state.habits.find(h => h.id === row.dataset.id);
  if(btn.dataset.act === 'toggle'){
    const t = todayStr();
    habit.xpClaimedDates = habit.xpClaimedDates || {};
    if(habit.log[t]){
      // Unchecking only affects streak/stats tracking (log), never removes XP already earned.
      delete habit.log[t];
      saveState(); renderHabits();
    } else {
      habit.log[t] = true;
      if(!habit.xpClaimedDates[t]){
        habit.xpClaimedDates[t] = true;
        addXp(5);
        showToast('Habit logged (+5 XP)');
      } else {
        showToast('Habit logged');
      }
      saveState(); renderHabits();
    }
  }
}

function openHabitModal(){
  openModal(`
    <h3>New habit</h3>
    <form id="habitForm">
      <div class="field"><label>Title</label><input name="title" required placeholder="e.g. Study IELTS 30 min"></div>
      <div class="field"><label>Category</label><select name="category">${CATEGORIES.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn btn-primary">Create habit</button>
      </div>
    </form>
  `, (modal) => {
    $('#cancelBtn', modal).addEventListener('click', closeModal);
    $('#habitForm', modal).addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.habits.push({ id: uid(), title: fd.get('title'), category: fd.get('category'), log:{}, xpClaimedDates:{} });
      saveState(); closeModal(); renderHabits();
    });
  });
}

/* ================================================================
   CALENDAR
   ================================================================ */
let calCursor = new Date();
let calSelected = todayStr();

function renderCalendar(){
  const root = $('#view-calendar');
  const year = calCursor.getFullYear(), month = calCursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthLabel = first.toLocaleDateString(undefined, { month:'long', year:'numeric' });

  let cells = '';
  for(let i=0;i<startOffset;i++) cells += `<div class="cal-day is-empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const dateStr = dateToStr(new Date(year, month, day));
    const items = dayItems(dateStr);
    const isToday = dateStr === todayStr();
    const isSelected = dateStr === calSelected;
    cells += `<button class="cal-day ${isToday?'is-today':''} ${isSelected?'is-selected':''}" data-date="${dateStr}">
      <span class="num">${day}</span>
      ${items.length ? `<div class="cal-dot-row">${items.slice(0,4).map(()=>'<span class="cal-dot"></span>').join('')}</div>` : ''}
    </button>`;
  }

  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Timeline</span><h2>Calendar</h2></div>
      <div class="stitched"></div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" id="prevMonth">‹ Prev</button>
        <span style="align-self:center; font-weight:700; font-family:var(--font-mono); font-size:13px;">${monthLabel}</span>
        <button class="btn btn-ghost btn-sm" id="nextMonth">Next ›</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <div class="calendar-grid">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
    </div>
    <div class="card">
      <span class="stat-label">Agenda — ${fmtDate(calSelected)}</span>
      <div id="agendaList" style="margin-top:10px;"></div>
    </div>
  `;
  $('#prevMonth').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth()-1); renderCalendar(); });
  $('#nextMonth').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth()+1); renderCalendar(); });
  $all('.cal-day[data-date]').forEach(btn => btn.addEventListener('click', () => { calSelected = btn.dataset.date; renderCalendar(); }));

  const agenda = dayItems(calSelected);
  $('#agendaList').innerHTML = agenda.length ? agenda.map(i => `<div class="row"><div class="row-main"><div class="row-title">${escapeHtml(i.label)}</div><div class="row-meta"><span class="chip chip-cat">${i.type}</span></div></div></div>`).join('')
    : emptyHtml('Nothing scheduled', 'Pick another day, or add a task with this deadline.');
}

function dayItems(dateStr){
  const items = [];
  state.tasks.filter(t => t.deadline === dateStr).forEach(t => items.push({ type:'Task', label:t.title }));
  state.goals.filter(g => g.deadline === dateStr).forEach(g => items.push({ type:'Goal deadline', label:g.title }));
  state.habits.filter(h => h.log[dateStr]).forEach(h => items.push({ type:'Habit', label:h.title }));
  return items;
}

/* ================================================================
   STATISTICS
   ================================================================ */
function renderStats(){
  const root = $('#view-stats');
  const longestStreak = state.habits.length ? Math.max(...state.habits.map(h => longestHabitStreak(h))) : 0;
  const goalPct = state.goals.length ? Math.round(state.goals.filter(g=>g.completed).length/state.goals.length*100) : 0;

  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Insight</span><h2>Statistics</h2></div>
      <div class="stitched"></div>
    </div>
    <div class="grid cols-2" style="margin-bottom:18px;">
      <div class="card stat-card"><span class="stat-label">Longest streak</span><span class="stat-value">${longestStreak} days</span></div>
      <div class="card stat-card"><span class="stat-label">Goal completion</span><span class="stat-value">${goalPct}%</span></div>
    </div>
    <div class="grid cols-3">
      <div class="card"><span class="stat-label">Last 7 days — tasks completed</span><div class="chart-wrap"><canvas class="chart-canvas" id="chartDaily"></canvas></div></div>
      <div class="card"><span class="stat-label">Last 6 weeks — productivity</span><div class="chart-wrap"><canvas class="chart-canvas" id="chartWeekly"></canvas></div></div>
      <div class="card"><span class="stat-label">Last 6 months — productivity</span><div class="chart-wrap"><canvas class="chart-canvas" id="chartMonthly"></canvas></div></div>
    </div>
  `;

  drawBarChart('chartDaily', last7DaysLabels(), last7DaysValues());
  drawBarChart('chartWeekly', lastNWeeksLabels(6), lastNWeeksValues(6));
  drawBarChart('chartMonthly', lastNMonthsLabels(6), lastNMonthsValues(6));
}

/* Registry of live Chart.js instances, keyed by canvas id, so we can
   destroy the previous chart before drawing a new one on re-render
   (canvases are rebuilt fresh each time renderStats() runs). */
const chartRegistry = {};

function longestHabitStreak(habit){
  const dates = Object.keys(habit.log).filter(d => habit.log[d]).sort();
  if(!dates.length) return 0;
  let longest = 1, run = 1;
  for(let i=1;i<dates.length;i++){
    if(daysDiff(dates[i], dates[i-1]) === 1) run++; else run = 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

function last7DaysLabels(){ return Array.from({length:7}, (_,i) => { const d = addDays(todayStr(), i-6); return new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short'}); }); }
function last7DaysValues(){ return Array.from({length:7}, (_,i) => { const d = addDays(todayStr(), i-6); return state.tasks.filter(t => t.completed && t.deadline === d).length; }); }

function lastNWeeksLabels(n){ return Array.from({length:n}, (_,i) => `W-${n-1-i}`); }
function lastNWeeksValues(n){
  return Array.from({length:n}, (_,i) => {
    const end = addDays(todayStr(), -(n-1-i)*7);
    const start = addDays(end, -6);
    return state.tasks.filter(t => t.completed && t.deadline && t.deadline >= start && t.deadline <= end).length;
  });
}
function lastNMonthsLabels(n){
  const out = [];
  const d = new Date();
  for(let i=n-1;i>=0;i--){ const dt = new Date(d.getFullYear(), d.getMonth()-i, 1); out.push(dt.toLocaleDateString(undefined,{month:'short'})); }
  return out;
}
function lastNMonthsValues(n){
  const out = [];
  const now = new Date();
  for(let i=n-1;i>=0;i--){
    const dt = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const y = dt.getFullYear(), m = dt.getMonth();
    out.push(state.tasks.filter(t => {
      if(!t.completed || !t.deadline) return false;
      const td = new Date(t.deadline+'T00:00:00');
      return td.getFullYear()===y && td.getMonth()===m;
    }).length);
  }
  return out;
}

function drawBarChart(canvasId, labels, values){
  const canvas = $('#'+canvasId);
  if(!canvas || typeof Chart === 'undefined') return;

  // destroy any previous chart bound to this canvas id to avoid leaks/overlap
  if(chartRegistry[canvasId]){ chartRegistry[canvasId].destroy(); }

  const styles = getComputedStyle(document.body);
  const accent = styles.getPropertyValue('--gold').trim();
  const muted = styles.getPropertyValue('--text-muted').trim();
  const border = styles.getPropertyValue('--border').trim();

  chartRegistry[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: accent,
        hoverBackgroundColor: accent,
        borderRadius: 4,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 260 * Number(state.settings.animSpeed || 1) },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: styles.getPropertyValue('--bg-elevated-2').trim(),
          titleColor: styles.getPropertyValue('--text').trim(),
          bodyColor: styles.getPropertyValue('--text').trim(),
          borderColor: border,
          borderWidth: 1,
          padding: 10,
          displayColors: false,
        },
      },
      scales: {
        x: { ticks: { color: muted, font: { size: 10, family: 'Manrope' } }, grid: { display: false }, border: { color: border } },
        y: { beginAtZero: true, ticks: { color: muted, precision: 0, font: { size: 10, family: 'Manrope' } }, grid: { color: border }, border: { color: border } },
      },
    },
  });
}

/* ================================================================
   NOTES
   ================================================================ */
function renderNotes(){
  const root = $('#view-notes');
  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Quick capture</span><h2>Notes</h2></div>
      <div class="stitched"></div>
      <button class="btn btn-primary" id="addNoteBtn">+ New note</button>
    </div>
    <div class="grid cols-3" id="notesGrid"></div>
  `;
  $('#addNoteBtn').addEventListener('click', () => {
    state.notes.unshift({ id: uid(), text:'', updatedAt: Date.now() });
    saveState(); renderNotes();
  });
  const grid = $('#notesGrid');
  grid.innerHTML = state.notes.length ? state.notes.map(noteCardHtml).join('') : emptyHtml('No notes yet', 'Jot down a quick thought.');
  grid.addEventListener('input', (e) => {
    const card = e.target.closest('[data-id]'); if(!card) return;
    const note = state.notes.find(n => n.id === card.dataset.id);
    note.text = e.target.value; note.updatedAt = Date.now();
    saveState();
  });
}
function noteCardHtml(n){
  return `<div class="card note-card" data-id="${n.id}">
    <textarea placeholder="Write a note…">${escapeHtml(n.text)}</textarea>
    <div class="row-actions" style="justify-content:flex-end;">
      <button class="menu-trigger" data-entity="note" data-id="${n.id}" aria-haspopup="true" aria-expanded="false" aria-label="More actions for this note" title="More actions">⋮</button>
    </div>
  </div>`;
}

/* ================================================================
   TIMER (Pomodoro / Countdown / Stopwatch)
   ================================================================ */
let timerMode = 'pomodoro';
let timerInterval = null;
let timerSeconds = state.settings.pomodoroWork * 60;
let timerRunning = false;
let pomodoroOnBreak = false;
let stopwatchSeconds = 0;
let countdownTotal = 5*60;

function renderTimer(){
  const root = $('#view-timer');
  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Deep work</span><h2>Timer</h2></div>
      <div class="stitched"></div>
    </div>
    <div class="card timer-face">
      <div class="timer-modes">
        ${['pomodoro','countdown','stopwatch'].map(m => `<button class="filter-pill ${timerMode===m?'is-active':''}" data-mode="${m}">${m[0].toUpperCase()+m.slice(1)}</button>`).join('')}
      </div>
      <div class="timer-display" id="timerDisplay">00:00</div>
      <div id="timerConfig"></div>
      <div class="timer-controls">
        <button class="btn btn-primary" id="timerStart">Start</button>
        <button class="btn btn-ghost" id="timerPause">Pause</button>
        <button class="btn btn-ghost" id="timerReset">Reset</button>
      </div>
    </div>
  `;
  $all('.timer-modes [data-mode]').forEach(btn => btn.addEventListener('click', () => {
    timerMode = btn.dataset.mode; stopTimerInterval(); resetTimerValue(); renderTimer();
  }));
  renderTimerConfig();
  updateTimerDisplay();
  $('#timerStart').addEventListener('click', startTimer);
  $('#timerPause').addEventListener('click', () => { stopTimerInterval(); });
  $('#timerReset').addEventListener('click', () => { stopTimerInterval(); resetTimerValue(); updateTimerDisplay(); });
}

function renderTimerConfig(){
  const cfg = $('#timerConfig');
  if(timerMode === 'pomodoro'){
    cfg.innerHTML = `<div class="field-row" style="max-width:260px;">
      <div class="field"><label>Work (min)</label><input type="number" id="pomoWork" value="${state.settings.pomodoroWork}" min="1"></div>
      <div class="field"><label>Break (min)</label><input type="number" id="pomoBreak" value="${state.settings.pomodoroBreak}" min="1"></div>
    </div>`;
    $('#pomoWork').addEventListener('change', (e) => { state.settings.pomodoroWork = Number(e.target.value)||25; saveState(); resetTimerValue(); updateTimerDisplay(); });
    $('#pomoBreak').addEventListener('change', (e) => { state.settings.pomodoroBreak = Number(e.target.value)||5; saveState(); });
  } else if(timerMode === 'countdown'){
    cfg.innerHTML = `<div class="field" style="max-width:160px;"><label>Minutes</label><input type="number" id="countdownMin" value="${countdownTotal/60}" min="1"></div>`;
    $('#countdownMin').addEventListener('change', (e) => { countdownTotal = (Number(e.target.value)||5)*60; resetTimerValue(); updateTimerDisplay(); });
  } else { cfg.innerHTML = ''; }
}

function resetTimerValue(){
  timerRunning = false; pomodoroOnBreak = false;
  if(timerMode === 'pomodoro') timerSeconds = state.settings.pomodoroWork*60;
  if(timerMode === 'countdown') timerSeconds = countdownTotal;
  if(timerMode === 'stopwatch') stopwatchSeconds = 0;
}

function updateTimerDisplay(){
  let secs = timerMode === 'stopwatch' ? stopwatchSeconds : timerSeconds;
  const m = String(Math.floor(secs/60)).padStart(2,'0');
  const s = String(secs%60).padStart(2,'0');
  const disp = $('#timerDisplay');
  if(disp) disp.textContent = `${m}:${s}`;
}

function startTimer(){
  if(timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(() => {
    if(timerMode === 'stopwatch'){ stopwatchSeconds++; }
    else{
      timerSeconds--;
      if(timerSeconds <= 0){
        if(timerMode === 'pomodoro'){
          pomodoroOnBreak = !pomodoroOnBreak;
          showToast(pomodoroOnBreak ? 'Break time!' : 'Back to work!');
          timerSeconds = (pomodoroOnBreak ? state.settings.pomodoroBreak : state.settings.pomodoroWork) * 60;
          if(!pomodoroOnBreak) addXp(15);
        } else {
          stopTimerInterval();
          showToast('Countdown finished!');
          confettiBurst();
        }
      }
    }
    updateTimerDisplay();
  }, 1000);
}
function stopTimerInterval(){ clearInterval(timerInterval); timerRunning = false; }

/* ================================================================
   SETTINGS
   ================================================================ */
function renderSettings(){
  const root = $('#view-settings');
  const s = state.settings;
  root.innerHTML = `
    <div class="section-head">
      <div><span class="section-eyebrow">Preferences</span><h2>Settings</h2></div>
      <div class="stitched"></div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <span class="stat-label">Appearance</span>
        <div class="field" style="margin-top:12px;"><label>Theme</label>
          <select id="setTheme"><option value="dark" ${s.theme==='dark'?'selected':''}>Dark</option><option value="light" ${s.theme==='light'?'selected':''}>Light</option></select>
        </div>
        <div class="field"><label>Accent color</label>
          <select id="setAccent">
            <option value="gold" ${s.accent==='gold'?'selected':''}>Gold</option>
            <option value="teal" ${s.accent==='teal'?'selected':''}>Teal</option>
            <option value="brick" ${s.accent==='brick'?'selected':''}>Brick</option>
            <option value="ink" ${s.accent==='ink'?'selected':''}>Indigo</option>
          </select>
        </div>
        <div class="field"><label>Font size</label>
          <select id="setFontSize"><option value="0.9" ${s.fontSize==0.9?'selected':''}>Small</option><option value="1" ${s.fontSize==1?'selected':''}>Default</option><option value="1.15" ${s.fontSize==1.15?'selected':''}>Large</option></select>
        </div>
        <div class="field"><label>Animation speed</label>
          <select id="setAnim"><option value="0" ${s.animSpeed==0?'selected':''}>Off</option><option value="0.6" ${s.animSpeed==0.6?'selected':''}>Fast</option><option value="1" ${s.animSpeed==1?'selected':''}>Normal</option><option value="1.6" ${s.animSpeed==1.6?'selected':''}>Slow</option></select>
        </div>
        <div class="field"><label>Language</label>
          <select id="setLang"><option value="en" ${s.language==='en'?'selected':''}>English</option><option value="ru" ${s.language==='ru'?'selected':''}>Русский</option><option value="uz" ${s.language==='uz'?'selected':''}>O'zbekcha</option></select>
        </div>
      </div>
      <div class="card">
        <span class="stat-label">Data</span>
        <p style="color:var(--text-muted); font-size:13px; margin:10px 0;">Everything is stored locally in this browser. Export a backup or restore from a previous one.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-ghost" id="exportBtn">⬇ Export JSON</button>
          <label class="btn btn-ghost" style="display:inline-flex; align-items:center;">⬆ Import JSON<input type="file" accept="application/json" id="importInput" hidden></label>
          <button class="btn btn-danger" id="resetBtn">Reset all data</button>
        </div>
      </div>
    </div>
  `;
  $('#setTheme').addEventListener('change', e => { s.theme = e.target.value; applySettings(); saveState(); });
  $('#setAccent').addEventListener('change', e => { s.accent = e.target.value; applySettings(); saveState(); });
  $('#setFontSize').addEventListener('change', e => { s.fontSize = Number(e.target.value); applySettings(); saveState(); });
  $('#setAnim').addEventListener('change', e => { s.animSpeed = Number(e.target.value); applySettings(); saveState(); });
  $('#setLang').addEventListener('change', e => { s.language = e.target.value; saveState(); showToast('Language preference saved'); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importInput').addEventListener('change', importData);
  $('#resetBtn').addEventListener('click', () => {
    openModal(`<h3>Reset all data?</h3><p style="color:var(--text-muted); font-size:13.5px;">This permanently deletes all goals, tasks, habits and notes stored in this browser.</p>
    <div class="modal-actions"><button class="btn btn-ghost" id="cancelReset">Cancel</button><button class="btn btn-danger" id="confirmReset">Delete everything</button></div>`,
    (modal) => {
      $('#cancelReset', modal).addEventListener('click', closeModal);
      $('#confirmReset', modal).addEventListener('click', () => {
        state = defaultState(); saveState(); applySettings(); closeModal(); switchView('dashboard'); renderXp(); showToast('All data reset');
      });
    });
  });
}

function applySettings(){
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  document.documentElement.setAttribute('data-accent', state.settings.accent);
  document.documentElement.style.setProperty('--fs-scale', state.settings.fontSize);
  document.documentElement.style.setProperty('--dur', state.settings.animSpeed);
  $('#themeToggle').textContent = state.settings.theme === 'dark' ? '◐' : '◑';
}

function exportData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ledger-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported');
}

function importData(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      state = { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...(parsed.settings||{}) } };
      saveState(); applySettings(); renderXp(); switchView('dashboard');
      showToast('Backup restored');
    }catch(err){ showToast('Import failed — invalid file'); }
  };
  reader.readAsText(file);
}

/* ================================================================
   SEARCH
   ================================================================ */
const searchInput = $('#globalSearch');
const searchResults = $('#searchResults');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if(!q){ searchResults.hidden = true; return; }
  const hits = [];
  state.goals.forEach(g => g.title.toLowerCase().includes(q) && hits.push({ type:'Goal', label:g.title, view:'goals' }));
  state.tasks.forEach(t => t.title.toLowerCase().includes(q) && hits.push({ type:'Task', label:t.title, view:'tasks' }));
  state.habits.forEach(h => h.title.toLowerCase().includes(q) && hits.push({ type:'Habit', label:h.title, view:'habits' }));
  state.notes.forEach(n => n.text.toLowerCase().includes(q) && hits.push({ type:'Note', label:n.text.slice(0,40)||'(empty note)', view:'notes' }));
  searchResults.hidden = hits.length === 0;
  searchResults.innerHTML = hits.slice(0,10).map(h => `<div class="search-hit" data-view="${h.view}">${escapeHtml(h.label)}<small>${h.type}</small></div>`).join('');
});
searchResults.addEventListener('click', (e) => {
  const hit = e.target.closest('[data-view]'); if(!hit) return;
  switchView(hit.dataset.view);
  searchResults.hidden = true; searchInput.value = '';
});
document.addEventListener('click', (e) => { if(!e.target.closest('.topbar-search')) searchResults.hidden = true; });

/* ================================================================
   THEME TOGGLE & KEYBOARD SHORTCUTS
   ================================================================ */
$('#themeToggle').addEventListener('click', () => {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  applySettings(); saveState();
});

document.addEventListener('keydown', (e) => {
  if(e.key === '/' && document.activeElement !== searchInput){ e.preventDefault(); searchInput.focus(); }
  if(e.key.toLowerCase() === 'n' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA'){
    openTaskModal();
  }
});

/* ================================================================
   OVERDUE NOTIFICATIONS
   ================================================================ */
function checkOverdue(){
  const overdue = state.tasks.filter(t => !t.completed && t.deadline && daysDiff(t.deadline, todayStr()) < 0);
  if(overdue.length){
    showToast(`⚠ You have ${overdue.length} overdue task${overdue.length>1?'s':''}`);
  }
}

/* ================================================================
   MISC HELPERS
   ================================================================ */
function emptyHtml(title, sub){
  return `<div class="empty"><h3>${title}</h3><p>${sub}</p></div>`;
}

/* ================================================================
   INIT
   ================================================================ */
function init(){
  applySettings();
  renderXp();
  switchView('dashboard');
  $('#quoteChip').textContent = `"${QUOTES[Math.floor(Math.random()*QUOTES.length)]}"`;
  setTimeout(checkOverdue, 900);
  window.addEventListener('resize', () => { if(currentView === 'stats') renderStats(); });
}
init();
