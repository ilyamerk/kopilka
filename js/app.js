// Логика интерфейса «Раскрась мечту». Данные хранятся в localStorage.
(function () {
  'use strict';

  const C = window.Calc;
  const D = window.Dreams;
  const STORAGE_KEY = 'kopilka.v1'; // ключ не меняем, чтобы не потерять уже сохранённые мечты
  const PHOTO_MAX_SIDE = 560;

  // ---------- Состояние ----------
  let state = load();
  let editingId = null;
  let pickedEmoji = D.DEFAULT_EMOJI;
  let pickedImage = null;
  let lastAddedId = null;
  let shownGoalId = null;
  let fillDelay = 0;
  let fillTimer = null;
  let photoToken = 0; // «поколение» выбора фото: устаревшие результаты декодирования игнорируются

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

  function save(silent) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      if (!silent) toast('Не удалось сохранить данные в браузере 😕');
      return false;
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
    name: $('d-name'), badge: $('d-badge'),
    target: $('d-target'), saved: $('d-saved'), left: $('d-left'),
    dream: $('d-dream'), imgDim: $('d-img-dim'), imgColor: $('d-img-color'),
    level: document.querySelector('#d-dream .dream__level'), percent: $('d-percent'),
    depForm: $('deposit-form'), depAmount: $('dep-amount'), depDate: $('dep-date'),
    depNote: $('dep-note'), depError: $('dep-error'),
    fcMonthly: $('fc-monthly'), fcResult: $('fc-result'),
    history: $('history'), historyEmpty: $('history-empty'),
    dialog: $('goal-dialog'), dialogTitle: $('goal-dialog-title'), goalForm: $('goal-form'),
    picker: $('emoji-picker'), gName: $('g-name'), gTarget: $('g-target'),
    gInitial: $('g-initial'), gInitialField: $('g-initial-field'), gMonthly: $('g-monthly'),
    gPhoto: $('g-photo'), gError: $('g-error'), gSubmit: $('g-submit'), toast: $('toast'),
  };

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function img(src, className) {
    const node = h('img', className);
    node.src = src;
    node.alt = '';
    node.draggable = false;
    node.decoding = 'async';
    return node;
  }

  // Цветной слой виден снизу на pct% высоты картинки.
  function clipFor(pct) {
    return 'inset(' + (100 - pct) + '% 0 0 0)';
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
      const src = D.pictureSrc(g);
      const mini = h('span', 'dream');
      const color = img(src, 'dream__img dream__img--color');
      color.style.clipPath = clipFor(pct);
      mini.append(img(src, 'dream__img dream__img--dim'), color);
      const pic = h('span', 'goal-item__pic');
      pic.append(mini);
      btn.append(
        pic,
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
    el.name.textContent = goal.name;
    el.badge.hidden = left > 0;
    el.target.textContent = C.formatMoney(goal.target);
    el.saved.textContent = C.formatMoney(saved);
    el.left.textContent = C.formatMoney(left);
    el.percent.textContent = C.formatPercent(pct);
    renderDream(goal, pct, left <= 0);

    if (document.activeElement !== el.fcMonthly) {
      el.fcMonthly.value = goal.monthly ? String(goal.monthly) : '';
    }
    renderForecast(goal, left);
    renderHistory(goal);
  }

  // Большая картинка: при переключении мечты заливка стартует с нуля,
  // при пополнении — плавно дорастает от прошлого значения.
  function renderDream(goal, pct, done) {
    const src = D.pictureSrc(goal);
    if (el.imgDim.getAttribute('src') !== src) {
      el.imgDim.src = src;
      el.imgColor.src = src;
    }
    if (shownGoalId !== goal.id) {
      shownGoalId = goal.id;
      [el.imgColor, el.level].forEach((n) => { n.style.transition = 'none'; });
      el.imgColor.style.clipPath = clipFor(0);
      el.level.style.bottom = '0%';
      void el.imgColor.offsetWidth; // применить «ноль» до запуска анимации
      [el.imgColor, el.level].forEach((n) => { n.style.transition = ''; });
    }
    const apply = () => {
      el.imgColor.style.clipPath = clipFor(pct);
      el.level.style.bottom = pct + '%';
      el.dream.classList.toggle('has-level', pct > 0 && !done);
      el.dream.classList.toggle('is-done', done);
    };
    clearTimeout(fillTimer); // быстрые повторные пополнения не должны откатывать заливку
    if (fillDelay) fillTimer = setTimeout(apply, fillDelay);
    else apply();
    fillDelay = 0;
    el.dream.setAttribute('aria-valuenow', pct);
    el.dream.setAttribute('aria-label', 'Мечта «' + goal.name + '» раскрашена на ' + C.formatPercent(pct));
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
  // Если картинка мечты не на экране — прокручиваем к ней, чтобы было видно,
  // как она наполняется цветом. Возвращает true, если прокрутили.
  function revealDream() {
    const r = el.dream.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.dream.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    fillDelay = reduce ? 0 : 450;
    return true;
  }

  // Возвращает null, если сохранить не удалось (пополнение откатывается),
  // иначе — была ли прокрутка к картинке.
  function addDeposit(goal, amount, date, note) {
    const wasDone = goalNumbers(goal).left <= 0;
    const dep = { id: uid(), amount, date, note: note || '', createdAt: Date.now() };
    goal.deposits.push(dep);
    if (!save(true)) {
      goal.deposits.pop();
      return null;
    }
    const scrolled = revealDream();
    lastAddedId = dep.id;
    render();
    if (!wasDone && goalNumbers(goal).left <= 0) celebrate(goal);
    else toast('+' + C.formatMoney(amount) + ' к мечте «' + goal.name + '»');
    return scrolled;
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

  // ---------- Диалог мечты ----------
  function renderPicker() {
    const photo = h('button', 'picker__photo');
    photo.type = 'button';
    photo.dataset.photo = '1';
    photo.setAttribute('aria-pressed', String(!!pickedImage));
    if (pickedImage) {
      photo.append(img(pickedImage));
      photo.title = 'Своё фото — нажми, чтобы заменить';
      photo.setAttribute('aria-label', 'Своё фото (заменить)');
    } else {
      photo.textContent = '📷 Своё фото';
    }
    el.picker.replaceChildren(photo, ...D.PICTURES.map((p) => {
      const b = h('button');
      b.type = 'button';
      b.dataset.emoji = p.emoji;
      b.title = p.label;
      b.setAttribute('aria-pressed', String(!pickedImage && p.emoji === pickedEmoji));
      b.setAttribute('aria-label', 'Картинка: ' + p.label);
      b.append(img(D.pictureSrc({ emoji: p.emoji })));
      return b;
    }));
  }

  function openGoalDialog(goal) {
    photoToken++;
    editingId = goal ? goal.id : null;
    pickedEmoji = goal && D.isKnown(goal.emoji) ? goal.emoji : D.DEFAULT_EMOJI;
    pickedImage = goal && goal.image ? goal.image : null;
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

  // Уменьшаем фото, чтобы оно поместилось в localStorage (там всего ~5 МБ).
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('not an image'));
      const url = URL.createObjectURL(file);
      const pic = new Image();
      pic.onload = () => {
        const k = Math.min(1, PHOTO_MAX_SIDE / Math.max(pic.naturalWidth, pic.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(pic.naturalWidth * k));
        canvas.height = Math.max(1, Math.round(pic.naturalHeight * k));
        canvas.getContext('2d').drawImage(pic, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        let data = canvas.toDataURL('image/webp', 0.85); // WebP сохраняет прозрачность
        if (data.indexOf('data:image/webp') !== 0) {
          data = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
        }
        resolve(data);
      };
      pic.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('decode failed'));
      };
      pic.src = url;
    });
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

    const backup = JSON.stringify(state);
    let message;
    if (editingId) {
      const g = state.goals.find((x) => x.id === editingId);
      Object.assign(g, { name, target, monthly, emoji: pickedEmoji, image: pickedImage || undefined });
      message = 'Мечта обновлена';
    } else {
      const g = { id: uid(), name, target, monthly, emoji: pickedEmoji, deposits: [], createdAt: Date.now() };
      if (pickedImage) g.image = pickedImage;
      if (initial > 0) {
        g.deposits.push({ id: uid(), amount: initial, date: C.todayISO(), note: 'Стартовая сумма', createdAt: Date.now() });
      }
      state.goals.push(g);
      state.activeId = g.id;
      message = 'Мечта «' + name + '» создана 🌱';
    }
    if (!save(true)) {
      state = JSON.parse(backup);
      return setError(el.gError, pickedImage
        ? 'Фото не поместилось в память браузера — выбери другое фото или встроенную картинку'
        : 'Не удалось сохранить данные в браузере');
    }
    el.dialog.close();
    toast(message);
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
        id: uid(), emoji: '📱', name: 'Новый телефон', target: 120000, monthly: 10000, createdAt: Date.now(),
        deposits: [dep(30000, 75, 'Стартовая сумма'), dep(12000, 40, 'День рождения'), dep(8000, 21), dep(4000, 6)],
      },
      {
        id: uid(), emoji: '🗼', name: 'Поездка в Японию', target: 200000, monthly: 10000, createdAt: Date.now(),
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
  el.dialog.addEventListener('close', () => { photoToken++; });

  el.goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitGoal();
  });

  el.picker.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.photo) {
      el.gPhoto.click();
      return;
    }
    photoToken++;
    pickedEmoji = b.dataset.emoji;
    pickedImage = null;
    renderPicker();
  });

  el.gPhoto.addEventListener('change', () => {
    const file = el.gPhoto.files[0];
    el.gPhoto.value = '';
    if (!file) return;
    const token = ++photoToken;
    readPhoto(file).then((data) => {
      if (token !== photoToken) return; // пользователь уже выбрал другое или закрыл окно
      pickedImage = data;
      setError(el.gError, '');
      renderPicker();
    }, () => {
      if (token !== photoToken) return;
      setError(el.gError, 'Не получилось открыть это фото — попробуй JPG или PNG');
    });
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
    if (!g || !confirm('Удалить мечту «' + g.name + '» вместе с историей?')) return;
    state.goals = state.goals.filter((x) => x.id !== g.id);
    state.activeId = state.goals[0] ? state.goals[0].id : null;
    save();
    render();
    toast('Мечта удалена');
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
    const scrolled = addDeposit(activeGoal(), amount, date, el.depNote.value.trim());
    if (scrolled === null) {
      return setError(el.depError, 'Не удалось сохранить пополнение: память браузера заполнена. Удали лишние фото мечт и попробуй ещё раз.');
    }
    el.depAmount.value = '';
    el.depNote.value = '';
    if (scrolled) el.depAmount.blur(); // не прыгаем обратно к форме и прячем клавиатуру на телефоне
    else el.depAmount.focus();
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
