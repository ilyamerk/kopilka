// Чистые функции расчётов. Без DOM — чтобы их можно было протестировать в Node.
(function (root) {
  'use strict';

  const MONTHS_GEN = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  const MONTHS_NOM = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
  ];

  // Округление до копеек, чтобы не копить ошибки float (0.1 + 0.2).
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // "5 000", "5000,50", "5 000 ₽" -> число; мусор, ноль и минус -> NaN.
  function parseAmount(value) {
    if (typeof value === 'number') return value > 0 && isFinite(value) ? round2(value) : NaN;
    if (typeof value !== 'string') return NaN;
    const cleaned = value.replace(/[\s ₽]/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
    const n = Number(cleaned);
    return n > 0 ? round2(n) : NaN;
  }

  function totalSaved(deposits) {
    return round2((deposits || []).reduce((acc, d) => acc + d.amount, 0));
  }

  function remaining(saved, target) {
    return round2(Math.max(0, target - saved));
  }

  // Процент выполнения, не больше 100, с точностью до десятых.
  // 100% показываем только когда цель реально достигнута (99 960 из 100 000 — это 99,9%).
  function progress(saved, target) {
    if (!(target > 0)) return 0;
    if (saved >= target) return 100;
    const p = Math.round((saved / target) * 1000) / 10;
    return Math.min(99.9, p);
  }

  function formatPercent(p) {
    return String(p).replace('.', ',') + '%';
  }

  function formatMoney(n) {
    const hasKopecks = Math.round(n * 100) % 100 !== 0;
    const s = n.toLocaleString('ru-RU', {
      minimumFractionDigits: hasKopecks ? 2 : 0,
      maximumFractionDigits: 2,
    });
    return s.replace(/ /g, ' ') + ' ₽';
  }

  // plural(5, ['месяц', 'месяца', 'месяцев']) -> 'месяцев'
  function plural(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  }

  function addMonths(date, months) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  // «Когда я накоплю?»: сколько месяцев при заданном ежемесячном взносе.
  // Возвращает null, если взнос не задан.
  function forecast(left, monthly, fromDate) {
    if (left <= 0) return { months: 0, date: fromDate || new Date(), done: true };
    if (!(monthly > 0)) return null;
    const months = Math.ceil(round2(left / monthly));
    return { months, date: addMonths(fromDate || new Date(), months), done: false };
  }

  function formatDuration(months) {
    if (months < 12) return months + ' ' + plural(months, ['месяц', 'месяца', 'месяцев']);
    const y = Math.floor(months / 12);
    const m = months % 12;
    let s = y + ' ' + plural(y, ['год', 'года', 'лет']);
    if (m) s += ' ' + m + ' ' + plural(m, ['месяц', 'месяца', 'месяцев']);
    return s;
  }

  function formatMonthYear(date) {
    return MONTHS_NOM[date.getMonth()] + ' ' + date.getFullYear();
  }

  // "2026-09-10" -> "10 сентября" (год добавляется, если он не текущий).
  function formatDay(iso, now) {
    const [y, mo, d] = iso.split('-').map(Number);
    const current = (now || new Date()).getFullYear();
    return d + ' ' + MONTHS_GEN[mo - 1] + (y !== current ? ' ' + y : '');
  }

  function todayISO(now) {
    const d = now || new Date();
    const pad = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  const Calc = {
    round2, parseAmount, totalSaved, remaining, progress, formatPercent, formatMoney,
    plural, addMonths, forecast, formatDuration, formatMonthYear, formatDay, todayISO,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== 'undefined' ? window : globalThis);
