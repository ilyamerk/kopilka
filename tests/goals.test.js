// Копилки: расчёты, прогноз, слияние, выгрузка и переезд со старой «Копилки на мечту»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAIReport,
  emptyData,
  formatDuration,
  goalForecast,
  goalLeft,
  goalPercent,
  goalProgress,
  goalSaved,
  goalsSummary,
  importKopilka,
  isGoalDone,
  mergeData,
  normalizeData,
  parseData,
  savedInRange,
  serializeData,
  sortDeposits,
  sortGoals,
  validateDeposit,
  validateGoal,
} from '../app/js/logic.js';

// Суммы в тестах — в рублях, внутри приложения — копейки
const R = 100;
const dep = (id, rub, date = '2026-09-10', extra = {}) => ({ id, amount: rub * R, date, note: '', createdAt: 1, ...extra });
const goal = (id, targetRub, deposits = [], extra = {}) => ({ id, name: `Цель ${id}`, emoji: '🎯', target: targetRub * R, monthly: 0, deposits, createdAt: 1, updatedAt: 1, ...extra });
const withGoals = (...goals) => normalizeData({ goals });

test('пример из ТЗ: 74 000 из 200 000 + 5 000 → 79 000, осталось 121 000, 39,5 %', () => {
  const [g] = withGoals(goal('japan', 200_000, [dep('a', 74_000), dep('b', 5000)])).goals;
  assert.equal(goalSaved(g), 79_000 * R);
  assert.equal(goalLeft(g), 121_000 * R);
  assert.equal(goalPercent(g), '39,5 %');
  assert.equal(isGoalDone(g), false);
});

test('ноутбук: 37 000 из 100 000 → 37 %, осталось 63 000', () => {
  const [g] = withGoals(goal('nb', 100_000, [dep('a', 37_000)])).goals;
  assert.equal(goalPercent(g), '37 %');
  assert.equal(goalLeft(g), 63_000 * R);
});

test('перебор: остаток не уходит в минус, процент не больше 100', () => {
  const [g] = withGoals(goal('x', 100_000, [dep('a', 120_000)])).goals;
  assert.equal(goalLeft(g), 0);
  assert.equal(goalProgress(g), 1);
  assert.equal(goalPercent(g), '100 %');
  assert.equal(isGoalDone(g), true);
});

test('процент: 100 % только когда реально накоплено, после первого рубля — не 0', () => {
  const [almost, tiny] = withGoals(goal('a', 100_000, [dep('x', 99_999.99)]), goal('b', 1_000_000, [dep('y', 1)])).goals;
  assert.equal(goalPercent(almost), '99,9 %');
  assert.equal(goalPercent(tiny), '0,1 %');
});

test('копейки складываются без ошибок float', () => {
  const [g] = withGoals(goal('k', 1, [{ id: 'a', amount: 10, date: '2026-09-01' }, { id: 'b', amount: 20, date: '2026-09-01' }])).goals;
  assert.equal(goalSaved(g), 30); // 0,10 ₽ + 0,20 ₽ = 0,30 ₽
});

test('«Когда я накоплю?»: 60 000 при 10 000/мес → 6 месяцев, март 2027', () => {
  const fc = goalForecast(60_000 * R, 10_000 * R, '2026-09-28');
  assert.deepEqual(fc, { months: 6, month: '2027-03', done: false });
});

test('прогноз округляет вверх и обрабатывает крайние случаи', () => {
  assert.equal(goalForecast(61_000 * R, 10_000 * R, '2026-09-28').months, 7);
  assert.equal(goalForecast(0, 10_000 * R, '2026-09-28').done, true);
  assert.equal(goalForecast(5000 * R, 0, '2026-09-28'), null);
  assert.equal(goalForecast(100 * R, 30 * R, '2026-12-01').month, '2027-04');
});

test('склонения и длительность', () => {
  const nb = (s) => s.replace(/ /g, ' ');
  assert.equal(nb(formatDuration(1)), '1 месяц');
  assert.equal(nb(formatDuration(3)), '3 месяца');
  assert.equal(nb(formatDuration(6)), '6 месяцев');
  assert.equal(nb(formatDuration(11)), '11 месяцев');
  assert.equal(nb(formatDuration(12)), '1 год');
  assert.equal(nb(formatDuration(26)), '2 года 2 месяца');
  assert.equal(nb(formatDuration(61)), '5 лет 1 месяц');
});

test('сводка и сортировка: недостигнутые сверху, ближе к цели — выше', () => {
  const data = withGoals(
    goal('done', 1000, [dep('a', 1000)]),
    goal('far', 100_000, [dep('b', 10_000)]),
    goal('near', 10_000, [dep('c', 9000)]),
    { id: 'gone', deleted: true, updatedAt: 5 },
  );
  assert.deepEqual(sortGoals(data.goals).map((g) => g.id), ['near', 'far', 'done']);
  const s = goalsSummary(data.goals);
  assert.deepEqual(s, { count: 3, done: 1, saved: 20_000 * R, left: 91_000 * R, target: 111_000 * R });
});

test('история: свежие сверху; отложено за период', () => {
  const [g] = withGoals(goal('g', 1e6, [dep('a', 100, '2026-08-31'), dep('b', 200, '2026-09-02', { createdAt: 1 }), dep('c', 300, '2026-09-02', { createdAt: 2 })])).goals;
  assert.deepEqual(sortDeposits(g.deposits).map((d) => d.id), ['c', 'b', 'a']);
  assert.equal(savedInRange([g], '2026-09-01', '2026-09-30'), 500 * R);
});

test('валидация цели и пополнения', () => {
  assert.match(validateGoal({ name: ' ', target: 100 }), /название/);
  assert.match(validateGoal({ name: 'Ноутбук', target: null }), /Стоимость/);
  assert.match(validateGoal({ name: 'Ноутбук', target: 100, monthly: -1 }), /в месяц/);
  assert.equal(validateGoal({ name: 'Ноутбук', target: 100, monthly: 0 }), null);
  assert.match(validateDeposit({ amount: null, date: '2026-09-01' }, '2026-09-10'), /больше нуля/);
  assert.match(validateDeposit({ amount: 100, date: '2026-09-11' }, '2026-09-10'), /будущем/);
  assert.equal(validateDeposit({ amount: 100, date: '2026-09-10' }, '2026-09-10'), null);
});

test('normalizeData: мусорные копилки и пополнения отбрасываются', () => {
  const { goals } = normalizeData({
    goals: [
      goal('ok', 1000, [dep('a', 10), { id: 'bad', amount: -5, date: '2026-09-01' }, { id: '', amount: 5, date: '2026-09-01' }, { id: 'nodate', amount: 5 }], { name: '  ', emoji: '' }),
      goal('zero', 0),
      { id: 'notarget', name: 'x' },
    ],
  });
  assert.equal(goals.length, 1);
  assert.equal(goals[0].name, 'Мечта');
  assert.equal(goals[0].emoji, '🎯');
  assert.deepEqual(goals[0].deposits.map((d) => d.id), ['a']);
});

test('синхронизация: копилки сливаются и переживают круговой обмен через файл', () => {
  const local = withGoals(goal('g', 1000, [dep('a', 10)], { updatedAt: 5 }));
  const remote = withGoals(goal('g', 1000, [], { updatedAt: 3 }), goal('h', 500, [], { updatedAt: 1 }));
  const { data, localChanged, remoteChanged } = mergeData(local, remote);
  assert.equal(localChanged, true);
  assert.equal(remoteChanged, true);
  assert.equal(data.goals.find((g) => g.id === 'g').deposits.length, 1);
  assert.ok(data.goals.some((g) => g.id === 'h'));
  const text = serializeData(normalizeData(data));
  assert.deepEqual(parseData(text).goals, normalizeData(data).goals);
});

test('файл старого трекера (версия 1, без копилок) читается', () => {
  const old = '{"app":"trecker_rashody","version":1,"transactions":[],"categories":[],"debts":[],"recurring":[],"presets":[]}';
  const data = parseData(old);
  assert.deepEqual(data.goals, []);
  assert.deepEqual(emptyData().goals, []);
});

test('выгрузка для ИИ: раздел копилок, отключается переключателем', () => {
  const data = withGoals(goal('j', 200_000, [dep('a', 74_000, '2026-08-01'), dep('b', 5000, '2026-09-05')], { name: 'Япония', emoji: '🗾', monthly: 10_000 * R }));
  const md = buildAIReport(data, { from: '2026-09-01', to: '2026-09-30' }, '2026-09-30');
  assert.match(md, /## Копилки/);
  assert.match(md, /Отложено за период: 5 000 ₽/);
  assert.match(md, /\| 🗾 Япония \| 200 000 \| 79 000 \| 121 000 \| 39,5 % \| 10 000 \|/);
  assert.doesNotMatch(buildAIReport(data, { from: '2026-09-01', to: '2026-09-30', goals: false }, '2026-09-30'), /Копилки/);
});

test('переезд из «Копилки на мечту»: рубли → копейки, id сохраняются, мусор отбрасывается', () => {
  const old = {
    goals: [
      {
        id: 'abc', emoji: '🗾', name: 'Поездка в Японию', target: 200000, monthly: 10000, createdAt: 7,
        deposits: [
          { id: 'd1', amount: 74000, date: '2026-08-01', note: 'Стартовая сумма', createdAt: 1 },
          { id: 'd2', amount: 1500.5, date: '2026-09-01', note: '', createdAt: 2 },
        ],
      },
      { id: 'broken', name: 'Без суммы', target: 0, deposits: [] },
      null,
    ],
    activeId: 'abc',
  };
  const goals = importKopilka(old);
  assert.equal(goals.length, 1);
  const [g] = goals;
  assert.equal(g.id, 'kopilka:abc');
  assert.equal(g.target, 20_000_000);
  assert.equal(g.monthly, 1_000_000);
  assert.deepEqual(g.deposits.map((d) => d.amount), [7_400_000, 150_050]);
  assert.equal(goalPercent(g), '37,7 %');
  assert.deepEqual(importKopilka(null), []);
  assert.deepEqual(importKopilka({ goals: 'мусор' }), []);
});
