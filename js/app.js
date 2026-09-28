// Логика интерфейса «Копилки на мечту». Данные хранятся в localStorage.
(function () {
  'use strict';

  const C = window.Calc;
  const STORAGE_KEY = 'kopilka.v1';
  const EMOJIS = ['🎯', '💻', '✈️', '🗾', '🚗', '📱', '🎮', '🏠', '🎸', '🚲', '📷', '🎓', '👟', '🐶', '🌴', '💍'];

  // ---------- Состояние ----------
  let state = load();
  let editingId = null;
  let pickedEmoji = EMOJIS[0];
  let lastAddedId = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.goals)) return data;
      }
    } catch (e) { /* повреждённые данные или запрет хранилища — начинаем с нуля */ }
    return { goals: [], activeId: null };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Не удалось сохранить данные в браузере 😕');
    }
  }

  function activeGoal() {
    return state.goals.find((g) => g.id === state.activeId) || state.goals[0] || null;
  }

  function goalNumbers(goal) {
    const saved = C.totalSaved(goal.deposits);
    return {
      saved,
      left: C.remaining(saved, goal.target),
      pct: C.progress(saved, goal.target),
    };
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    empty: $('empty'), layout: $('layout'), list: $('goals-list'),
    sumCount: $('sum-count'), sumSaved: $('sum-saved'), sumLeft: $('sum-left'),
    emoji: $('d-emoji'), name: $('d-name'), badge: $('d-badge'),
    target: $('d-target'), saved: $('d-saved'), left: $('d-left'),
    progress: $('d-progress'), fill: $('d-fill'), percent: $('d-percent'),
    depForm: $('deposit-form'), depAmount: $('dep-amount'), depDate: $('dep-date'),
    depNote: $('dep-note'), depError: $('dep-error'),
    fcMonthly: $('fc-monthly'), fcResult: $('fc-result'),
    history: $('history'), historyEmpty: $('history-empty'),
    dialog: $('goal-dialog'), dialogTitle: $('goal-dialog-title'), goalForm: $('goal-form'),
    picker: $('emoji-picker'), gName: $('g-name'), gTarget: $('g-target'),
    gInitial: $('g-initial'), gInitialField: $('g-initial-field'), gMonthly: $('g-monthly'),
    gError: $('g-error'), gSubmit: $('g-submit'), toast: $('toast'),
  };

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---------- Рендер ----------
  function render() {
    const hasGoals = state.goals.length > 0;
    el.empty.hidden = hasGoals;
    el.layout.hidden = !hasGoals;
    renderSummary();
    if (!hasGoals) return;
    const goal = activeGoal();
    state.activeId = goal.id;
    renderList(goal);
    renderDetails(goal);
  }

  function renderSummary() {
    let saved = 0;
    let left = 0;
    state.goals.forEach((g) => {
      const n = goalNumbers(g);
      saved += n.saved;
      left += n.left;
    });
    el.sumCount.textContent = state.goals.length;
    el.sumSaved.textContent = C.formatMoney(C.round2(saved));
    el.sumLeft.textContent = C.formatMoney(C.round2(left));
  }

  function renderList(active) {
    el.list.replaceChildren(...state.goals.map((g) => {
      const { pct } = goalNumbers(g);
      const li = h('li');
      const btn = h('button', 'goal-item' + (g.id === active.id ? ' is-active' : ''));
      btn.type = 'button';
      btn.dataset.id = g.id;
      if (g.id === active.id) btn.setAttribute('aria-current', 'true');
      const bar = h('span', 'goal-item__bar');
      const fill = h('span');
      fill.style.width = pct + '%';
      bar.append(fill);
      btn.append(
        h('span', 'goal-item__emoji', g.emoji),
        h('span', 'goal-item__name', g.name),
        h('span', 'goal-item__pct', C.formatPercent(pct)),
        bar,
      );
      li.append(btn);
      return li;
    }));
  }

  function renderDetails(goal) {
    const { saved, left, pct } = goalNumbers(goal);
    el.emoji.textContent = goal.emoji;
    el.name.textContent = goal.name;
    el.badge.hidden = left > 0;
    el.target.textContent = C.formatMoney(goal.target);
    el.saved.textContent = C.formatMoney(saved);
    el.left.textContent = C.formatMoney(left);
    el.fill.style.width = pct + '%';
    el.percent.textContent = C.formatPercent(pct);
    el.progress.setAttribute('aria-valuenow', pct);
    el.progress.setAttribute('aria-label', 'Прогресс: ' + C.formatPercent(pct));

    if (document.activeElement !== el.fcMonthly) {
      el.fcMonthly.value = goal.monthly ? String(goal.monthly) : '';
    }
    renderForecast(goal, left);
    renderHistory(goal);
  }

  function renderForecast(goal, left) {
    const box = el.fcResult;
    box.replaceChildren();
    if (left <= 0) {
      box.append(h('p', 'forecast__big', 'Цель уже достигнута! 🎉'));
      box.append(h('p', null, 'Можно исполнять мечту или поставить новую.'));
      return;
    }
    const fc = C.forecast(left, goal.monthly);
    if (!fc) {
      box.append(h('p', null, 'До цели осталось ' + C.formatMoney(left) + '.'));
      box.append(h('p', 'muted', 'Укажи, сколько можешь откладывать в месяц, — посчитаем, когда накопишь.'));
      return;
    }
    box.append(h('p', null, 'До цели осталось ' + C.formatMoney(left) + '.'));
    const p = h('p', null, 'При текущем темпе ты достигнешь цели примерно через ');
    p.append(h('span', 'forecast__big', C.formatDuration(fc.months)));
    box.append(p);
    box.append(h('p', 'muted', 'Ориентировочно: ' + C.formatMonthYear(fc.date) + '.'));
  }

  function renderHistory(goal) {
    const items = goal.deposits
      .slice()
      .sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date < a.date ? -1 : 1));
    el.historyEmpty.hidden = items.length > 0;
    el.history.replaceChildren(...items.map((d) => {
      const li = h('li', 'history__item' + (d.id === lastAddedId ? ' is-new' : ''));
      const del = h('button', 'history__del', '×');
      del.type = 'button';
      del.dataset.depId = d.id;
      del.title = 'Удалить пополнение';
      del.setAttribute('aria-label', 'Удалить пополнение ' + C.formatMoney(d.amount));
      li.append(
        h('span', 'history__date', C.formatDay(d.date)),
        h('span', 'history__note', d.note || ''),
        h('span', 'history__amount', '+' + C.formatMoney(d.amount)),
        del,
      );
      return li;
    }));
    lastAddedId = null;
  }

  // ---------- Действия ----------
  function addDeposit(goal, amount, date, note) {
    const wasDone = goalNumbers(goal).left <= 0;
    const dep = { id: uid(), amount, date, note: note || '', createdAt: Date.now() };
    goal.deposits.push(dep);
    lastAddedId = dep.id;
    save();
    render();
    if (!wasDone && goalNumbers(goal).left <= 0) celebrate(goal);
    else toast('+' + C.formatMoney(amount) + ' в копилку «' + goal.name + '»');
  }

  function celebrate(goal) {
    toast('Ура! Мечта «' + goal.name + '» накоплена! 🎉');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const pieces = ['🎉', '💚', '✨', '🪙', '🌿', goal.emoji];
    for (let i = 0; i < 36; i++) {
      const s = h('span', 'confetti', pieces[i % pieces.length]);
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDuration = 2 + Math.random() * 2 + 's';
      s.style.animationDelay = Math.random() * 0.6 + 's';
      document.body.append(s);
      s.addEventListener('animationend', () => s.remove());
    }
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
  }

  // ---------- Диалог копилки ----------
  function renderPicker() {
    el.picker.replaceChildren(...EMOJIS.map((e) => {
      const b = h('button', null, e);
      b.type = 'button';
      b.dataset.emoji = e;
      b.setAttribute('aria-pressed', String(e === pickedEmoji));
      b.setAttribute('aria-label', 'Иконка ' + e);
      return b;
    }));
  }

  function openGoalDialog(goal) {
    editingId = goal ? goal.id : null;
    pickedEmoji = goal ? goal.emoji : EMOJIS[0];
    el.dialogTitle.textContent = goal ? 'Изменить мечту' : 'Новая мечта';
    el.gSubmit.textContent = goal ? 'Сохранить' : 'Создать';
    el.gName.value = goal ? goal.name : '';
    el.gTarget.value = goal ? String(goal.target) : '';
    el.gMonthly.value = goal && goal.monthly ? String(goal.monthly) : '';
    el.gInitial.value = '';
    el.gInitialField.hidden = !!goal; // стартовая сумма — только при создании
    setError(el.gError, '');
    [el.gName, el.gTarget, el.gInitial, el.gMonthly].forEach((i) => i.classList.remove('is-invalid'));
    renderPicker();
    el.dialog.showModal();
    el.gName.focus();
  }

  function setError(node, msg, input) {
    node.textContent = msg;
    if (input) input.classList.add('is-invalid');
  }

  function submitGoal() {
    [el.gName, el.gTarget, el.gInitial, el.gMonthly].forEach((i) => i.classList.remove('is-invalid'));
    const name = el.gName.value.trim();
    const target = C.parseAmount(el.gTarget.value);
    const initialRaw = el.gInitial.value.trim();
    const monthlyRaw = el.gMonthly.value.trim();
    const initial = initialRaw ? C.parseAmount(initialRaw) : 0;
    const monthly = monthlyRaw ? C.parseAmount(monthlyRaw) : 0;

    if (!name) return setError(el.gError, 'Придумай название мечты', el.gName);
    if (isNaN(target)) return setError(el.gError, 'Стоимость — положительное число, например 100 000', el.gTarget);
    if (isNaN(initial)) return setError(el.gError, 'Проверь сумму «Уже накоплено»', el.gInitial);
    if (isNaN(monthly)) return setError(el.gError, 'Проверь сумму ежемесячного взноса', el.gMonthly);

    if (editingId) {
      const g = state.goals.find((x) => x.id === editingId);
      Object.assign(g, { name, target, monthly, emoji: pickedEmoji });
      toast('Копилка обновлена');
    } else {
      const g = { id: uid(), name, target, monthly, emoji: pickedEmoji, deposits: [], createdAt: Date.now() };
      if (initial > 0) {
        g.deposits.push({ id: uid(), amount: initial, date: C.todayISO(), note: 'Стартовая сумма', createdAt: Date.now() });
      }
      state.goals.push(g);
      state.activeId = g.id;
      toast('Мечта «' + name + '» создана 🌱');
    }
    save();
    el.dialog.close();
    render();
  }

  // ---------- Демо-данные для презентации ----------
  function fillDemo() {
    const now = new Date();
    const daysAgo = (n) => {
      const d = new Date(now);
      d.setDate(d.getDate() - n);
      return C.todayISO(d);
    };
    const dep = (amount, days, note) => ({ id: uid(), amount, date: daysAgo(days), note: note || '', createdAt: Date.now() - days * 864e5 });
    state.goals = [
      {
        id: uid(), emoji: '🗾', name: 'Поездка в Японию', target: 200000, monthly: 10000, createdAt: Date.now(),
        deposits: [dep(50000, 60, 'Стартовая сумма'), dep(6000, 45), dep(3000, 34), dep(10000, 25, 'Премия'), dep(5000, 18)],
      },
      {
        id: uid(), emoji: '💻', name: 'Новый ноутбук', target: 100000, monthly: 8000, createdAt: Date.now(),
        deposits: [dep(30000, 90, 'Стартовая сумма'), dep(15000, 50), dep(12000, 20), dep(7000, 5, 'С подработки')],
      },
      {
        id: uid(), emoji: '🚗', name: 'Автомобиль', target: 900000, monthly: 25000, createdAt: Date.now(),
        deposits: [dep(50000, 70, 'Стартовая сумма'), dep(22000, 10)],
      },
    ];
    state.activeId = state.goals[0].id;
    save();
    render();
    toast('Добавили пример — можно пробовать 🙌');
  }

  // ---------- События ----------
  $('btn-new-goal').addEventListener('click', () => openGoalDialog(null));
  $('btn-empty-new').addEventListener('click', () => openGoalDialog(null));
  $('btn-demo').addEventListener('click', fillDemo);
  $('g-cancel').addEventListener('click', () => el.dialog.close());

  el.goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitGoal();
  });

  el.picker.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-emoji]');
    if (!b) return;
    pickedEmoji = b.dataset.emoji;
    renderPicker();
  });

  el.list.addEventListener('click', (e) => {
    const b = e.target.closest('.goal-item');
    if (!b) return;
    state.activeId = b.dataset.id;
    save();
    render();
  });

  $('btn-edit').addEventListener('click', () => openGoalDialog(activeGoal()));

  $('btn-delete').addEventListener('click', () => {
    const g = activeGoal();
    if (!g || !confirm('Удалить копилку «' + g.name + '» вместе с историей?')) return;
    state.goals = state.goals.filter((x) => x.id !== g.id);
    state.activeId = state.goals[0] ? state.goals[0].id : null;
    save();
    render();
    toast('Копилка удалена');
  });

  el.depForm.addEventListener('submit', (e) => {
    e.preventDefault();
    el.depAmount.classList.remove('is-invalid');
    el.depDate.classList.remove('is-invalid');
    const amount = C.parseAmount(el.depAmount.value);
    const date = el.depDate.value;
    if (isNaN(amount)) return setError(el.depError, 'Введи сумму больше нуля, например 5 000', el.depAmount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError(el.depError, 'Выбери дату пополнения', el.depDate);
    if (date > C.todayISO()) return setError(el.depError, 'Дата пополнения не может быть в будущем', el.depDate);
    setError(el.depError, '');
    addDeposit(activeGoal(), amount, date, el.depNote.value.trim());
    el.depAmount.value = '';
    el.depNote.value = '';
    el.depAmount.focus();
  });

  el.depForm.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick]');
    if (!b) return;
    const current = C.parseAmount(el.depAmount.value);
    const next = (isNaN(current) ? 0 : current) + Number(b.dataset.quick);
    el.depAmount.value = String(C.round2(next));
    el.depAmount.classList.remove('is-invalid');
    setError(el.depError, '');
  });

  el.history.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dep-id]');
    if (!b) return;
    const g = activeGoal();
    const d = g.deposits.find((x) => x.id === b.dataset.depId);
    if (!d || !confirm('Удалить пополнение ' + C.formatMoney(d.amount) + ' от ' + C.formatDay(d.date) + '?')) return;
    g.deposits = g.deposits.filter((x) => x.id !== d.id);
    save();
    render();
    toast('Пополнение удалено');
  });

  // Прогноз пересчитывается на лету при вводе
  el.fcMonthly.addEventListener('input', () => {
    const g = activeGoal();
    const raw = el.fcMonthly.value.trim();
    const monthly = raw ? C.parseAmount(raw) : 0;
    el.fcMonthly.classList.toggle('is-invalid', isNaN(monthly));
    if (isNaN(monthly)) return;
    g.monthly = monthly;
    save();
    renderForecast(g, goalNumbers(g).left);
  });

  // Синхронизация между вкладками
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = load();
    render();
  });

  el.depDate.value = C.todayISO();
  el.depDate.max = C.todayISO();
  render();
})();
