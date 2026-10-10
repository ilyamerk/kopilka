// Копилки: экран со списком целей, шторка копилки (пополнение, прогноз, история) и форма цели.
import {
  addDays,
  amountToInput,
  formatDuration,
  formatMoney,
  goalForecast,
  goalLeft,
  goalPercent,
  goalProgress,
  goalSaved,
  goalsSummary,
  isGoalDone,
  monthRange,
  monthTitle,
  newId,
  parseAmount,
  savedInRange,
  shortDate,
  sortDeposits,
  sortGoals,
  todayISO,
  validateDeposit,
  validateGoal,
} from './logic.js';
import { firstGrapheme, showError } from './sheets.js';
import { put, remove, restore, state } from './state.js';
import { $, $$, closeSheet, confirmDialog, html, openSheet, raw, sheetIsOpen, toast } from './ui.js';

const money = (kop, opts) => formatMoney(kop, opts);
const rub = (kop, opts) => formatMoney(Math.round(kop / 100) * 100, opts);

export const GOAL_EMOJI = ['🎯', '💻', '✈️', '🗾', '🚗', '📱', '🎮', '🏠', '🎸', '🚲', '📷', '🎓', '👟', '🐶', '🌴', '💍', '🎁', '🛋️', '⌚', '🏍️', '🎧', '🏖️', '💰', '🛟'];
const QUICK = [500, 1000, 5000, 10000]; // рубли

const findGoal = (id) => state.data.goals.find((g) => g.id === id && !g.deleted);
const pct = (g) => (goalProgress(g) * 100).toFixed(1);

// ---------- Экран «Копилки» ----------

function goalRow(g) {
  const done = isGoalDone(g);
  return html`
    <button type="button" class="row goal-row" data-action="open-goal" data-id="${g.id}">
      <span class="emoji" aria-hidden="true">${g.emoji}</span>
      <span class="row-main">
        <span class="row-title">${g.name}</span>
        <span class="row-sub num">${rub(goalSaved(g))} из ${rub(g.target)}</span>
        <span class="goal-track ${done ? 'done' : ''}" aria-hidden="true"><i style="width:${pct(g)}%"></i></span>
      </span>
      <span class="row-amount num ${done ? 'pos' : ''}">
        ${done ? '🎉' : goalPercent(g)}
        <small>${done ? 'накоплено' : `ещё ${rub(goalLeft(g))}`}</small>
      </span>
    </button>`;
}

export function renderGoals() {
  const { data, ui } = state;
  const sum = goalsSummary(data.goals);
  const goals = sortGoals(data.goals);
  const { from, to } = monthRange(ui.month);
  const month = savedInRange(data.goals, from, to);
  if (!goals.length) {
    return html`
      <div class="empty">
        <div class="big">🐷</div>
        Здесь пока нет ни одной мечты.<br>Создай копилку: придумай цель, укажи её стоимость — и начинай откладывать.
        <div class="btn-row" style="margin-top:18px">
          <button type="button" class="btn primary" data-action="goal-new">＋ Создать мечту</button>
          <button type="button" class="btn" data-action="goals-demo">Заполнить примером</button>
        </div>
      </div>
      <p class="note">Копилки не попадают в расходы и доходы — это отложенные деньги, а не потраченные.</p>`;
  }
  return html`
    <div class="card">
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Копилок</div><div class="kpi-value num">${sum.count}${sum.done ? html` <span class="muted small">· ${sum.done} 🎉</span>` : ''}</div></div>
        <div class="kpi"><div class="kpi-label">Накоплено</div><div class="kpi-value num pos">${rub(sum.saved)}</div></div>
        <div class="kpi"><div class="kpi-label">Осталось</div><div class="kpi-value num">${rub(sum.left)}</div></div>
      </div>
      <div class="progress" aria-hidden="true"><i style="width:${((sum.saved >= sum.target ? 1 : sum.saved / sum.target) * 100).toFixed(1)}%"></i></div>
    </div>
    <h3 class="section-title">Мои копилки · ${goals.length}</h3>
    <div class="list">${goals.map(goalRow)}</div>
    <p class="note">${month ? `За ${monthTitle(ui.month).toLowerCase()} отложено ${rub(month)}. ` : ''}Копилки не попадают в расходы и доходы — это отложенные деньги, а не потраченные.</p>`;
}

// ---------- Шторка копилки ----------

// Прогноз «Когда я накоплю?» — разметка без обёртки, чтобы обновлять её на лету
function forecastHtml(g, monthly) {
  const left = goalLeft(g);
  if (!left) return html`<p class="forecast-big">Цель уже достигнута! 🎉</p><p class="muted small">Можно исполнять мечту или поставить новую.</p>`;
  const fc = goalForecast(left, monthly, todayISO());
  if (!fc) return html`<p>До цели осталось <b class="num">${money(left)}</b>.</p><p class="muted small">Укажи, сколько можешь откладывать в месяц, — посчитаю, когда накопишь.</p>`;
  return html`
    <p>До цели осталось <b class="num">${money(left)}</b>. При таком темпе накопишь примерно через</p>
    <p class="forecast-big">${formatDuration(fc.months)}</p>
    <p class="muted small">Ориентировочно: ${monthTitle(fc.month).toLowerCase()}.</p>`;
}

// Взнос в месяц сохраняем с задержкой, пока человек печатает; при закрытии или перерисовке — сразу
let pendingMonthly = null;
let shownGoal = null; // какая копилка открыта в шторке — для кнопки «Вернуть»
let lastShown = null; // { id, saved } — с чего плавно «доезжают» сумма и прогресс после пополнения

// Сумма плавно «досчитывается» до новой
function countUp(el, from, to, ms = 700) {
  if (!el || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = money(Math.round(from + (to - from) * eased));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = money(from);
  requestAnimationFrame(step);
}
function flushMonthly() {
  const save = pendingMonthly;
  pendingMonthly = null;
  save?.();
}

export function openGoalSheet(id) {
  flushMonthly();
  const g = findGoal(id);
  if (!g) return closeSheet();
  shownGoal = id;
  const today = todayISO();
  const saved = goalSaved(g);
  const left = goalLeft(g);
  const deposits = sortDeposits(g.deposits);
  const prev = lastShown?.id === id ? lastShown.saved : null;
  lastShown = { id, saved };
  const fromPct = prev === null ? 0 : (Math.min(1, prev / g.target) * 100).toFixed(1);
  const body = openSheet(
    `${g.emoji} ${g.name}`,
    html`
    <div class="hero">
      <div class="muted">Накоплено</div>
      <div class="big num pos" id="goalSaved">${money(saved)}</div>
      <div class="muted small num">из ${money(g.target)}${left ? ` · осталось ${money(left)}` : ''}</div>
    </div>
    <div class="progress tall" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(g)}" aria-label="Прогресс: ${goalPercent(g)}"><i class="grow" style="--from:${fromPct}%;width:${pct(g)}%"></i></div>
    <div class="progress-caption"><span>Прогресс</span><b class="num">${goalPercent(g)}</b></div>
    ${left ? '' : html`<p class="goal-badge">Цель достигнута 🎉</p>`}

    <h3 class="section-title">💰 Пополнить</h3>
    <form id="depForm" novalidate autocomplete="off">
      <label class="amount-field">
        <input name="amount" inputmode="decimal" enterkeyhint="done" placeholder="0" aria-label="Сумма пополнения">
        <span>₽</span>
      </label>
      <div class="chips quick-amounts" role="group" aria-label="Быстрые суммы">
        ${QUICK.map((r) => html`<button type="button" class="chip" data-quick="${r * 100}">+${formatMoney(r * 100, { currency: false })}</button>`)}
      </div>
      <div class="date-row">
        <button type="button" class="chip" data-date="${today}">Сегодня</button>
        <button type="button" class="chip" data-date="${addDays(today, -1)}">Вчера</button>
        <input class="input" type="date" name="date" value="${today}" max="${today}" aria-label="Дата пополнения">
      </div>
      <input class="input" name="note" maxlength="60" placeholder="Комментарий: например, премия" aria-label="Комментарий">
      <p class="form-error" role="alert"></p>
      <button type="submit" class="btn primary block" style="margin-top:4px">＋ В копилку</button>
    </form>

    <h3 class="section-title">⏳ Когда я накоплю?</h3>
    <div class="card forecast">
      <label class="field" style="margin-top:0"><span>Могу откладывать в месяц, ₽</span>
        <input class="input" name="monthly" inputmode="decimal" placeholder="10 000" value="${g.monthly ? amountToInput(g.monthly) : ''}" autocomplete="off">
      </label>
      <div id="fcResult">${forecastHtml(g, g.monthly)}</div>
    </div>

    <h3 class="section-title">📜 История пополнений${deposits.length ? ` · ${deposits.length}` : ''}</h3>
    ${deposits.length
      ? html`
        <div class="list">
          ${deposits.map(
            (p) => html`
            <div class="row">
              <span class="emoji" aria-hidden="true">🪙</span>
              <span class="row-main"><span class="row-title num pos">+${money(p.amount)}</span><span class="row-sub">${[shortDate(p.date, today), p.note].filter(Boolean).join(' · ')}</span></span>
              <button type="button" class="icon-btn" data-del-dep="${p.id}" aria-label="Удалить пополнение ${money(p.amount)}">✕</button>
            </div>`,
          )}
        </div>`
      : html`<p class="note">Пополнений пока нет — добавь первое!</p>`}

    <div class="sheet-actions">
      <button type="button" class="btn" data-edit>Изменить</button>
      <button type="button" class="btn danger" data-delete>Удалить</button>
    </div>`,
    {
      onClose: () => {
        shownGoal = null;
        lastShown = null;
        flushMonthly();
      },
    },
  );
  if (prev !== null) countUp($('#goalSaved', body), prev, saved);
  const form = $('#depForm', body);
  const renderDate = () => $$('[data-date]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === form.date.value)));
  renderDate();

  form.addEventListener('change', (e) => {
    if (e.target.name === 'date') renderDate();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseAmount(form.amount.value);
    const dep = { id: newId(), amount, date: form.date.value, note: form.note.value.trim(), createdAt: Date.now() };
    const err = validateDeposit(dep, todayISO());
    if (err) return showError(form, err);
    const current = findGoal(id);
    if (!current) return closeSheet();
    const wasDone = isGoalDone(current);
    const next = await put('goals', { ...current, deposits: [...current.deposits, dep] });
    openGoalSheet(id);
    if (!wasDone && isGoalDone(next)) celebrate(next);
    else toast(`+${money(amount)} в копилку «${next.name}»`);
  });

  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.quick) {
      const cur = parseAmount(form.amount.value) ?? 0;
      form.amount.value = amountToInput(cur + Number(t.dataset.quick));
      showError(form, '');
    } else if (t.dataset.date) {
      form.date.value = t.dataset.date;
      renderDate();
    } else if (t.dataset.delDep) {
      const current = findGoal(id);
      const dep = current?.deposits.find((p) => p.id === t.dataset.delDep);
      if (!dep) return;
      await put('goals', { ...current, deposits: current.deposits.filter((p) => p.id !== dep.id) });
      openGoalSheet(id);
      toast(`Пополнение ${money(dep.amount)} удалено`, {
        action: 'Вернуть',
        onAction: async () => {
          const now = findGoal(id);
          if (now && !now.deposits.some((p) => p.id === dep.id)) await put('goals', { ...now, deposits: [...now.deposits, dep] });
          if (sheetIsOpen() && shownGoal === id) openGoalSheet(id);
        },
      });
    } else if ('edit' in t.dataset) {
      openGoalForm({ id });
    } else if ('delete' in t.dataset) {
      const current = findGoal(id);
      const ok = await confirmDialog({ title: 'Удалить копилку?', text: `«${current.name}» вместе с историей пополнений (${money(goalSaved(current))}).`, ok: 'Удалить', danger: true });
      if (!ok) return;
      const prev = await remove('goals', id);
      closeSheet();
      if (prev) toast('Копилка удалена', { action: 'Вернуть', onAction: () => restore('goals', prev) });
    }
  });

  // Прогноз пересчитывается на лету при вводе
  const monthlyInput = $('input[name=monthly]', body);
  let timer = null;
  monthlyInput.addEventListener('input', () => {
    const raw = monthlyInput.value.trim();
    const monthly = raw ? parseAmount(raw) : 0;
    monthlyInput.classList.toggle('is-invalid', monthly === null);
    if (monthly === null) return;
    $('#fcResult', body).innerHTML = forecastHtml(findGoal(id) ?? g, monthly).s;
    clearTimeout(timer);
    pendingMonthly = () => {
      clearTimeout(timer);
      const current = findGoal(id);
      if (current && current.monthly !== monthly) put('goals', { ...current, monthly });
    };
    timer = setTimeout(flushMonthly, 600);
  });
}

// ---------- Форма копилки ----------

export function openGoalForm({ id = null } = {}) {
  flushMonthly();
  shownGoal = null;
  const g = id ? findGoal(id) : null;
  if (id && !g) return closeSheet();
  const body = openSheet(
    g ? 'Изменить мечту' : 'Новая мечта',
    html`
    <form id="goalForm" novalidate autocomplete="off">
      <div class="inline-form" style="grid-template-columns:64px 1fr">
        <input class="input" name="emoji" value="${g?.emoji ?? GOAL_EMOJI[0]}" aria-label="Эмодзи" style="font-size:24px">
        <input class="input" name="goalName" maxlength="40" value="${g?.name ?? ''}" placeholder="Поездка в Японию" aria-label="Название мечты" ${g ? '' : raw('autofocus')}>
      </div>
      <div class="emoji-palette">${GOAL_EMOJI.map((em) => html`<button type="button" data-emoji="${em}" aria-label="${em}">${em}</button>`)}</div>
      <label class="field"><span>Стоимость цели, ₽</span><input class="input" name="target" inputmode="decimal" placeholder="200 000" value="${g ? amountToInput(g.target) : ''}"></label>
      ${g ? '' : html`<label class="field"><span>Уже накоплено, ₽ (необязательно)</span><input class="input" name="initial" inputmode="decimal" placeholder="0"></label>`}
      <label class="field"><span>Могу откладывать в месяц, ₽ (необязательно)</span><input class="input" name="monthly" inputmode="decimal" placeholder="10 000" value="${g?.monthly ? amountToInput(g.monthly) : ''}"></label>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions"><button type="submit" class="btn primary">${g ? 'Сохранить' : 'Создать'}</button></div>
      ${g ? html`<button type="button" class="btn ghost block" data-back style="margin-top:6px">← К копилке</button>` : ''}
    </form>`,
  );
  const form = $('#goalForm', body);
  form.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.emoji) form.emoji.value = t.dataset.emoji;
    else if ('back' in t.dataset) openGoalSheet(id);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amountOrZero = (input) => (input && input.value.trim() ? parseAmount(input.value) : 0);
    const name = form.goalName.value.trim();
    const target = parseAmount(form.target.value);
    const monthly = amountOrZero(form.monthly);
    const initial = amountOrZero(form.initial);
    const err = validateGoal({ name, target, monthly: monthly ?? -1 });
    if (err) return showError(form, err);
    if (initial === null) return showError(form, 'Проверь сумму «Уже накоплено»');
    const emoji = firstGrapheme(form.emoji.value) || '🎯';
    if (g) {
      await put('goals', { ...findGoal(id), name, emoji, target, monthly });
      openGoalSheet(id);
      toast('Копилка обновлена');
      return;
    }
    const deposits = initial ? [{ id: newId(), amount: initial, date: todayISO(), note: 'Стартовая сумма', createdAt: Date.now() }] : [];
    const saved = await put('goals', { id: newId(), name, emoji, target, monthly, deposits, createdAt: Date.now() });
    openGoalSheet(saved.id);
    toast(`Мечта «${name}» создана 🌱`);
  });
}

// ---------- Пример для демонстрации ----------

export async function fillGoalsDemo() {
  const today = todayISO();
  const now = Date.now();
  const dep = (rub, days, note = '') => ({ id: newId(), amount: rub * 100, date: addDays(today, -days), note, createdAt: now - days * 86_400_000 });
  const goals = [
    { emoji: '🗾', name: 'Поездка в Японию', target: 200_000, monthly: 10_000, deposits: [dep(50_000, 60, 'Стартовая сумма'), dep(6000, 45), dep(3000, 34), dep(10_000, 25, 'Премия'), dep(5000, 18)] },
    { emoji: '💻', name: 'Новый ноутбук', target: 100_000, monthly: 8000, deposits: [dep(30_000, 90, 'Стартовая сумма'), dep(15_000, 50), dep(12_000, 20), dep(7000, 5, 'С подработки')] },
    { emoji: '🚗', name: 'Автомобиль', target: 900_000, monthly: 25_000, deposits: [dep(50_000, 70, 'Стартовая сумма'), dep(22_000, 10)] },
  ];
  for (const [i, g] of goals.entries()) {
    await put('goals', { ...g, id: newId(), target: g.target * 100, monthly: g.monthly * 100, createdAt: now + i });
  }
  toast('Добавили пример — можно пробовать 🙌');
}

// ---------- Праздник, когда цель достигнута ----------

function celebrate(g) {
  toast(`Ура! Мечта «${g.name}» накоплена! 🎉`);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const pieces = ['🎉', '💚', '✨', '🪙', '🌿', g.emoji];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span');
    s.className = 'confetti';
    s.textContent = pieces[i % pieces.length];
    s.style.left = `${Math.random() * 100}vw`;
    s.style.animationDuration = `${2 + Math.random() * 2}s`;
    s.style.animationDelay = `${Math.random() * 0.6}s`;
    // Шторка открыта поверх страницы — конфетти кладём в неё, иначе их закроет затемнение
    ($('#sheet').open ? $('#sheet') : document.body).append(s);
    s.addEventListener('animationend', () => s.remove());
  }
}
