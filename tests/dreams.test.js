// Тесты набора картинок мечты: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../js/dreams.js');

test('код эмодзи совпадает с именем файла Twemoji', () => {
  assert.equal(D.emojiCode('📱'), '1f4f1');
  assert.equal(D.emojiCode('✈️'), '2708');
  assert.equal(D.emojiCode('⌚'), '231a');
});

test('для каждой картинки в наборе есть SVG-файл', () => {
  for (const p of D.PICTURES) {
    const file = path.join(__dirname, '..', D.pictureSrc({ emoji: p.emoji }));
    assert.ok(fs.existsSync(file), p.emoji + ' → ' + file);
  }
});

test('своё фото важнее встроенной картинки, неизвестный эмодзи → запасная картинка', () => {
  assert.equal(D.pictureSrc({ emoji: '📱', image: 'data:image/webp;base64,AAA' }), 'data:image/webp;base64,AAA');
  assert.equal(D.pictureSrc({ emoji: '🦄' }), 'img/dreams/1f3af.svg');
  assert.equal(D.pictureSrc({ emoji: '📱' }), 'img/dreams/1f4f1.svg');
});
