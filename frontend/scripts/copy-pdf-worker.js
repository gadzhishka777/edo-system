#!/usr/bin/env node
/**
 * Копирует воркер pdf.js в frontend/public/, чтобы он раздавался с нашего домена.
 *
 * ЗАЧЕМ. Раньше воркер подгружался с внешнего CDN:
 *     https://unpkg.com/pdfjs-dist@<версия>/build/pdf.worker.min.js
 * Это ломается по двум причинам:
 *   1) CSP продакшена (`script-src 'self'`, `worker-src 'self' blob:`) запрещает
 *      скрипты и воркеры с чужих домены — предпросмотр PDF в «Документах» падает;
 *   2) клиент без доступа в интернет (закрытый контур) вообще не получит воркер.
 * Ослаблять script-src до стороннего CDN нельзя: это supply-chain-риск.
 *
 * ВАЖНО про версию. react-pdf 8.x тянет СВОЙ pdfjs-dist 3.x (вложенный в
 * node_modules/react-pdf), а в корне проекта лежит pdfjs-dist 4.x, у которого
 * классического .js-воркера уже нет. Поэтому воркер берём строго из
 * react-pdf-овского pdfjs-dist — иначе версии API и воркера разъедутся.
 *
 * Запускается автоматически: npm-хуки prestart/prebuild (см. package.json).
 * Вручную: node scripts/copy-pdf-worker.js
 */
const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.resolve(__dirname, '..');
const TARGET = path.join(FRONTEND_DIR, 'public', 'pdf.worker.min.js');

function fail(message) {
  console.error('\n[pdf-worker] ОШИБКА: ' + message + '\n');
  process.exit(1);
}

/**
 * Каталог пакета `name`, установленного с корня frontend/.
 *
 * Через require.resolve('name/package.json') нельзя: у react-pdf объявлено поле
 * "exports", которое НЕ открывает подпуть ./package.json, и резолв падает с
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Поэтому резолвим точку входа пакета и
 * поднимаемся вверх до каталога, где лежит package.json с нужным именем.
 */
function resolvePackageDir(name) {
  let entry;
  try {
    entry = require.resolve(name, { paths: [FRONTEND_DIR] });
  } catch (e) {
    return null;
  }
  let dir = path.dirname(entry);
  for (let depth = 0; depth < 12; depth++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        if (JSON.parse(fs.readFileSync(pkgPath, 'utf8')).name === name) return dir;
      } catch (e) {
        // битый package.json — идём выше
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const reactPdfDir = resolvePackageDir('react-pdf');
if (!reactPdfDir) {
  fail('не найден пакет react-pdf. Выполните npm ci в каталоге frontend/.');
}

// Вложенная копия pdfjs-dist — приоритетный источник (та, что реально использует react-pdf).
const nestedPdfjs = path.join(reactPdfDir, 'node_modules', 'pdfjs-dist');
const hoistedPdfjs = path.join(FRONTEND_DIR, 'node_modules', 'pdfjs-dist');
const pdfjsDir = fs.existsSync(nestedPdfjs) ? nestedPdfjs : hoistedPdfjs;

if (!fs.existsSync(pdfjsDir)) {
  fail('не найден pdfjs-dist ни рядом с react-pdf, ни в корне node_modules.');
}

let pdfjsVersion = '?';
try {
  pdfjsVersion = JSON.parse(
    fs.readFileSync(path.join(pdfjsDir, 'package.json'), 'utf8')
  ).version;
} catch (e) {
  // версия не критична — просто не покажем её в логе
}

// Классический .js-воркер есть только в pdfjs-dist 3.x.
const candidates = [
  path.join(pdfjsDir, 'build', 'pdf.worker.min.js'),
  path.join(pdfjsDir, 'legacy', 'build', 'pdf.worker.min.js'),
];
const source = candidates.find((p) => fs.existsSync(p));

if (!source) {
  fail(
    'не найден build/pdf.worker.min.js в ' + pdfjsDir + ' (версия ' + pdfjsVersion + ').\n' +
    '  Похоже, react-pdf обновился до pdfjs-dist 4.x, где воркер — ES-модуль (.mjs).\n' +
    '  Тогда в src/pages/DocumentsPage.tsx нужно перейти на .mjs-воркер и\n' +
    '  разрешить его в CSP как `worker-src \'self\' blob:`.'
  );
}

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.copyFileSync(source, TARGET);

const kb = Math.round(fs.statSync(TARGET).size / 1024);
console.log(
  `[pdf-worker] скопирован pdfjs-dist@${pdfjsVersion}: ${path.relative(FRONTEND_DIR, source)} -> public/pdf.worker.min.js (${kb} КБ)`
);
