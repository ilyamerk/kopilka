// Набор картинок мечты. Каждая картинка — SVG в img/dreams/<код эмодзи>.svg
// (графика Twemoji, телефон нарисован отдельно). Без DOM — тестируется в Node.
(function (root) {
  'use strict';

  const PICTURES = [
    { emoji: '📱', label: 'Телефон' },
    { emoji: '💻', label: 'Ноутбук' },
    { emoji: '🎧', label: 'Наушники' },
    { emoji: '⌚', label: 'Часы' },
    { emoji: '🎮', label: 'Приставка' },
    { emoji: '📷', label: 'Фотоаппарат' },
    { emoji: '🎸', label: 'Гитара' },
    { emoji: '🚗', label: 'Автомобиль' },
    { emoji: '🚲', label: 'Велосипед' },
    { emoji: '🛴', label: 'Самокат' },
    { emoji: '✈️', label: 'Путешествие' },
    { emoji: '🗼', label: 'Токио' },
    { emoji: '🗾', label: 'Япония' },
    { emoji: '🌴', label: 'Отдых' },
    { emoji: '🏠', label: 'Дом' },
    { emoji: '🎓', label: 'Учёба' },
    { emoji: '👟', label: 'Кроссовки' },
    { emoji: '💍', label: 'Украшение' },
    { emoji: '🐶', label: 'Питомец' },
    { emoji: '🎁', label: 'Подарок' },
    { emoji: '🎯', label: 'Другая цель' },
  ];

  const DEFAULT_EMOJI = PICTURES[0].emoji;
  const FALLBACK_EMOJI = '🎯';

  // '✈️' -> '2708', '📱' -> '1f4f1' (как в именах файлов Twemoji, без FE0F)
  function emojiCode(emoji) {
    return Array.from(emoji)
      .map((ch) => ch.codePointAt(0).toString(16))
      .filter((cp) => cp !== 'fe0f')
      .join('-');
  }

  function isKnown(emoji) {
    return PICTURES.some((p) => p.emoji === emoji);
  }

  // Своё фото пользователя важнее встроенной картинки.
  function pictureSrc(goal) {
    if (goal && goal.image) return goal.image;
    const emoji = goal && isKnown(goal.emoji) ? goal.emoji : FALLBACK_EMOJI;
    return 'img/dreams/' + emojiCode(emoji) + '.svg';
  }

  const Dreams = { PICTURES, DEFAULT_EMOJI, emojiCode, isKnown, pictureSrc };

  if (typeof module !== 'undefined' && module.exports) module.exports = Dreams;
  else root.Dreams = Dreams;
})(typeof window !== 'undefined' ? window : globalThis);
