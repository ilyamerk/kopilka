// Тесты расчётов: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

test('пример из ТЗ: 74 000 из 200 000 + 5 000', () => {
  const deposits = [{ amount: 74000 }, { amount: 5000 }];
  const saved = C.totalSaved(deposits);
  assert.equal(saved, 79000);
  assert.equal(C.remaining(saved, 200000), 121000);
  assert.equal(C.progress(saved, 200000), 39.5);
  assert.equal(C.formatPercent(39.5), '39,5%');
});

test('ноутбук: 37 000 из 100 000 → 37%, осталось 63 000', () => {
  assert.equal(C.progress(37000, 100000), 37);
  assert.equal(C.remaining(37000, 100000), 63000);
});

test('перебор: остаток не уходит в минус, процент не больше 100', () => {
  assert.equal(C.remaining(120000, 100000), 0);
  assert.equal(C.progress(120000, 100000), 100);
});

test('копейки складываются без ошибок float', () => {
  assert.equal(C.totalSaved([{ amount: 0.1 }, { amount: 0.2 }]), 0.3);
});

test('парсинг сумм', () => {
  assert.equal(C.parseAmount('5 000'), 5000);
  assert.equal(C.parseAmount('5000,50'), 5000.5);
  assert.equal(C.parseAmount('10 000 ₽'), 10000);
  assert.ok(Number.isNaN(C.parseAmount('')));
  assert.ok(Number.isNaN(C.parseAmount('0')));
  assert.ok(Number.isNaN(C.parseAmount('-100')));
  assert.ok(Number.isNaN(C.parseAmount('abc')));
  assert.ok(Number.isNaN(C.parseAmount('1.234')));
});

test('«Когда я накоплю?»: 60 000 при 10 000/мес → 6 месяцев', () => {
  const fc = C.forecast(60000, 10000, new Date(2026, 8, 28));
  assert.equal(fc.months, 6);
  assert.equal(C.formatMonthYear(fc.date), 'март 2027');
});

test('прогноз округляет вверх и обрабатывает крайние случаи', () => {
  assert.equal(C.forecast(61000, 10000).months, 7);
  assert.equal(C.forecast(0, 10000).done, true);
  assert.equal(C.forecast(5000, 0), null);
});

test('склонения и длительность', () => {
  assert.equal(C.formatDuration(1), '1 месяц');
  assert.equal(C.formatDuration(3), '3 месяца');
  assert.equal(C.formatDuration(6), '6 месяцев');
  assert.equal(C.formatDuration(11), '11 месяцев');
  assert.equal(C.formatDuration(12), '1 год');
  assert.equal(C.formatDuration(26), '2 года 2 месяца');
  assert.equal(C.formatDuration(61), '5 лет 1 месяц');
});

test('форматирование дат истории', () => {
  const now = new Date(2026, 8, 28);
  assert.equal(C.formatDay('2026-09-10', now), '10 сентября');
  assert.equal(C.formatDay('2025-08-25', now), '25 августа 2025');
  assert.equal(C.todayISO(now), '2026-09-28');
});

test('форматирование денег', () => {
  assert.equal(C.formatMoney(126000), '126 000 ₽');
  assert.equal(C.formatMoney(1500.5), '1 500,50 ₽');
});

test('100% только при реально достигнутой цели', () => {
  assert.equal(C.progress(99960, 100000), 99.9);
  assert.equal(C.progress(100000, 100000), 100);
  assert.equal(C.progress(0, 100000), 0);
});
