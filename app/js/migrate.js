// Переезд со старых приложений того же сайта (<логин>.github.io — общий адрес,
// поэтому их хранилища видны и отсюда):
//   «Трекер расходов»  — IndexedDB 'trecker-rashody': операции, долги, настройки, синхронизация;
//   «Копилка на мечту» — localStorage 'kopilka.v1': цели и пополнения.
// Старые данные только читаем и ничего в них не меняем. Переезд — один раз на устройство.
import { importKopilka, normalizeData } from './logic.js';

const DONE_KEY = 'moneta.migrated';

function readOldTracker() {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open('trecker-rashody');
    } catch {
      return resolve(null);
    }
    // Базы не было — и не создаём её
    req.onupgradeneeded = () => req.transaction.abort();
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.close();
        return resolve(null);
      }
      const t = db.transaction('kv', 'readonly');
      const data = t.objectStore('kv').get('data');
      const settings = t.objectStore('kv').get('settings');
      t.oncomplete = () => {
        db.close();
        resolve({ data: data.result ?? null, settings: settings.result ?? null });
      };
      t.onerror = t.onabort = () => {
        db.close();
        resolve(null);
      };
    };
  });
}

function readOldKopilka() {
  try {
    const raw = localStorage.getItem('kopilka.v1');
    return raw ? importKopilka(JSON.parse(raw)) : [];
  } catch {
    return []; // повреждённые данные или запрет хранилища
  }
}

const alreadyDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
};

// → { data, settings, sources } или null, если переносить нечего
export async function migrateLegacy() {
  if (alreadyDone()) return null;
  const tracker = await readOldTracker();
  const goals = readOldKopilka();
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* без localStorage переезд просто повторится — дублей не будет, id те же */
  }
  const sources = [];
  if (tracker?.data) sources.push('трекер расходов');
  if (goals.length) sources.push('копилка');
  if (!sources.length && !tracker?.settings) return null;
  const data = normalizeData(tracker?.data ?? {});
  data.goals.push(...goals.filter((g) => !data.goals.some((x) => x.id === g.id)));
  return { data, settings: tracker?.settings ?? null, sources };
}
