import { KEY, initialState, validateState, dateKey, daysInMonth, setAttendance, copyLesson, clearLesson, monthRows, reconcileStudents } from './model.js';
import { matchesStudent, studentId } from './roster.js';
import { setupNavigation } from './navigation.js';
import { setupAttendanceGesture } from './attendance-gesture.js';
import { createAttendanceWorkbook, SUMMARY_HEADERS } from './excel.js';

const navigation = setupNavigation(document.querySelector('.nav'), screen => navigate(screen));
let studentQuery = '';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = initialState(), storageError = '', date = dateKey(), month = date.slice(0, 7), lesson = 1, draft = [];

try {
  const saved = localStorage.getItem(KEY);
  if (saved) state = validateState(JSON.parse(saved));
} catch {
  storageError = 'Не удалось прочитать локальные данные браузера. Исходное хранилище не повреждено.';
}
let storageLocked = !!storageError;

function notify(text, error = false) {
  const el = $('#notice');
  el.className = 'notice' + (error ? ' error' : '');
  el.textContent = text;
}

function persist(next = state) {
  if (storageLocked) { notify(storageError, true); return false; }
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    state = next;
    return true;
  } catch {
    notify('Не удалось сохранить: хранилище браузера недоступно или заполнено. Скачайте резервную копию. Изменение не применено.', true);
    return false;
  }
}

function mutate(fn) {
  const next = structuredClone(state);
  fn(next);
  return persist(next);
}

function confirmAction(title, text) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

function syncNavigation(screen) { navigation.sync(screen); }

function navigate(screen) {
  $('#' + screen).checked = true;
  syncNavigation(screen);
  $('#screen-name').textContent = ' / ' + ({ today: 'Отметки', sheet: 'Ведомость', group: 'Группа' }[screen]);
  if (screen === 'today') renderToday();
  if (screen === 'sheet') renderSheet();
}

const prettyDate = value => new Date(value + 'T12:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'short' });
const prettyMonth = value => new Date(value + '-01T12:00:00').toLocaleDateString('ru', { month: 'long', year: 'numeric' });
function demoNote() {
  return state.demo ? '<p class="demo-note">Демонстрационный состав из референса. Замените его своим списком в разделе «Группа».</p>' : '';
}

function renderToday() {
  const absent = state.marks[date]?.[lesson] || [];
  const late = state.late?.[date]?.[lesson] || [];
  const presentCount = state.students.length - absent.length - late.length;
  $('#today-panel').innerHTML = `
    <div class="page-heading">
      <div>
        <h1>Кто сегодня на паре?</h1>
        <p class="subtitle">Отметьте отсутствующих и опоздавших. Часы в ведомости считаются автоматически.</p>
      </div>
      <div class="date-control">
        <button class="button arrow" data-day="-1" aria-label="Предыдущий день">‹</button>
        <input class="button date" type="date" id="mark-date" aria-label="Дата отметок" value="${date}">
        <button class="button arrow" data-day="1" aria-label="Следующий день">›</button>
      </div>
    </div>
    <div class="workspace">
      <div class="lesson-bar">
        <div>
          <div class="small-label">Номер пары</div>
          <div class="lessons" aria-label="Выбор пары">
            ${Array.from({ length: 6 }, (_, i) => `
              <div class="lesson">
                <input type="radio" name="lesson" id="l${i + 1}" value="${i + 1}" ${lesson === i + 1 ? 'checked' : ''}>
                <label class="button" for="l${i + 1}">${i + 1}</label>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="lesson-meta">
          <strong>Одна пара — 2 академических часа</strong>
          <span>Пропуск — 2 ч · Опоздание — 1 ч</span>
        </div>
      </div>
      <div class="toolbar">
        <div class="actions">
          <button class="button" id="copy" ${lesson === 1 ? 'disabled' : ''}>Скопировать с ${Math.max(1, lesson - 1)}-й пары</button>
          <button class="button quiet" id="clear" ${!absent.length && !late.length ? 'disabled' : ''}>Очистить пару</button>
        </div>
        <span class="autosave">Сохранено на устройстве</span>
      </div>
      <div class="roster-caption">
        <h2>Список группы <span class="group-total" id="present-total" aria-live="polite">На паре: ${presentCount}</span></h2>
        <span>Нажмите — отсутствует<br>Зажмите — опоздал</span>
      </div>
      <div class="roster-search">
        <label class="field-label" for="student-search">Найти студента</label>
        <div class="search-controls">
          <input id="student-search" class="text-field" type="search" placeholder="Фамилия или имя" autocomplete="off" value="${esc(studentQuery)}" aria-controls="attendance-roster" aria-describedby="search-result">
          <button type="button" id="reset-search" aria-label="Очистить поиск" ${studentQuery ? '' : 'hidden'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
          </button>
        </div>
        <p id="search-result" role="status" aria-live="polite"></p>
      </div>
      <div class="roster" id="attendance-roster">
        ${state.students.length ? state.students.map((s, i) => `
          <div class="student ${late.includes(s.id) ? 'is-late' : ''}">
            <input type="checkbox" id="mark-${s.id}" data-student="${s.id}" ${absent.includes(s.id) ? 'checked' : ''}>
            <label for="mark-${s.id}">
              <span class="number">${i + 1}</span>
              <span class="student-name">${esc(s.name)}</span>
              <span class="attendance">
                <i class="dot"></i>
                <span class="yes">На паре</span>
                <span class="no">Нет на паре</span>
                <span class="late-status">Опоздал · 1 ч</span>
              </span>
            </label>
          </div>
        `).join('') : '<div class="empty">Список группы пуст. <button class="button" data-go-group>Добавить студентов</button></div>'}
        <div class="empty" id="search-empty" hidden>Никого не нашли. Проверьте имя или сбросьте поиск.</div>
        <div class="roster-footer">
          <span class="absent-count">Отсутствуют: <strong id="absent-total">${absent.length}</strong> · Опоздали: ${late.length}</span>
          <span class="hint">Нажатие вернёт «На паре» · Зажатие отметит «Опоздал» (1 ч)</span>
        </div>
      </div>
    </div>
    <p class="bottom-note">Отметки сохраняются на устройстве в браузере Safari. Резервную копию можно сохранить во вкладке «Группа».</p>
    ${demoNote()}
  `;
  filterRoster();
}

function filterRoster() {
  let count = 0;
  document.querySelectorAll('#attendance-roster .student').forEach((row, i) => {
    row.hidden = !matchesStudent(state.students[i].name, studentQuery);
    if (!row.hidden) count++;
  });
  $('#search-result').textContent = studentQuery.trim() ? `Найдено: ${count} из ${state.students.length}` : '';
  $('#reset-search').hidden = !studentQuery;
  $('#search-empty').hidden = !state.students.length || count > 0;
}

function renderSheet() {
  const rows = monthRows(state, month), days = daysInMonth(month);
  const weekend = d => [0, 6].includes(new Date(`${month}-${String(d).padStart(2, '0')}T12:00:00`).getDay());
  $('#sheet-panel').innerHTML = `
    <div class="page-heading">
      <div>
        <h1>Ведомость пропусков</h1>
        <p class="subtitle">Группа ${esc(state.group)} · ${prettyMonth(month)} · Пропущенные академические часы</p>
      </div>
      <div class="sheet-actions">
        <button class="button" id="print">Просмотр и печать</button>
        <button class="button primary" id="excel">Скачать Excel</button>
      </div>
    </div>
    <div class="workspace">
      <div class="sheet-controls">
        <div class="date-control">
          <button class="button arrow" data-month="-1" aria-label="Предыдущий месяц">‹</button>
          <input class="button date" type="month" id="sheet-month" aria-label="Месяц ведомости" value="${month}">
          <button class="button arrow" data-month="1" aria-label="Следующий месяц">›</button>
        </div>
        <p>${rows.length} студентов · Пропуск пары = 2 ч · Опоздание = 1 ч</p>
      </div>
      <div class="table-scroll" tabindex="0" aria-label="Ведомость, прокрутка по горизонтали">
        <table class="sheet-table">
          <caption class="print-title">Ведомость пропусков группы ${esc(state.group)}</caption>
          <thead>
            <tr>
              <th scope="col">№</th>
              <th scope="col">ФИО студента</th>
              ${Array.from({ length: days }, (_, i) => `
                <th scope="col" class="${weekend(i + 1) ? 'weekend' : ''} ${dateKey() === `${month}-${String(i + 1).padStart(2, '0')}` ? 'current' : ''}">
                  ${i + 1}
                  <small>${new Date(`${month}-${String(i + 1).padStart(2, '0')}T12:00:00`).toLocaleDateString('ru', { weekday: 'short' })}</small>
                </th>
              `).join('')}
              ${SUMMARY_HEADERS.map(title => `<th scope="col" class="summary-column">${title}<small>часов</small></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(s.name)}</td>
                ${s.days.map((hours, j) => `
                  <td class="${hours ? 'hours ' : ''}${weekend(j + 1) ? 'weekend' : ''}">
                    <button class="cell-button" data-edit-day="${j + 1}" aria-label="${esc(s.name)}, ${j + 1} число: ${hours} часов. Открыть отметки">${hours || ''}</button>
                  </td>
                `).join('')}
                <td class="summary-column">${s.total}</td>
                <td class="summary-column"></td>
                <td class="summary-column">${s.total}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="${days + 2}" scope="row">Итого</th>
              <td class="summary-column">${rows.reduce((sum, s) => sum + s.total, 0)}</td>
              <td class="summary-column"></td>
              <td class="summary-column">${rows.reduce((sum, s) => sum + s.total, 0)}</td>
            </tr>
          </tfoot>
        </table>
        ${!rows.length ? '<div class="empty">Добавьте студентов в разделе «Группа».</div>' : ''}
      </div>
      <div class="table-footer">
        <span class="legend"><i class="swatch"></i>Выходные дни</span>
        <span>Нажмите на день для корректировки · Фамилии закреплены слева</span>
      </div>
    </div>
    <p class="bottom-note">В Excel — полный месяц, границы ячеек и итоговые часы по каждому студенту (пропуск — 2 ч, опоздание — 1 ч). Пустая ячейка означает отсутствие пропусков.</p>
  `;
}

function renderGroup() {
  draft = structuredClone(state.students);
  $('#group-panel').innerHTML = `
    <div class="page-heading">
      <div>
        <h1>Группа ${esc(state.group)}</h1>
        <p class="subtitle">Состав группы, название и резервная копия — всё в одном месте.</p>
        ${demoNote()}
      </div>
    </div>
    <div class="settings-layout">
      <section class="settings-section group-editor">
        <h2>Состав группы</h2>
        <p>Исправьте имя прямо в строке или введите весь список целиком.</p>
        <label for="group-name" class="field-label">Название группы</label>
        <input id="group-name" class="text-field group-name-field" maxlength="80" value="${esc(state.group)}">
        <div class="group-list-heading">
          <div class="field-label">Студенты <span class="group-total" id="group-total"></span></div>
          <button class="button" id="add">＋ Добавить</button>
        </div>
        <ol class="group-list" aria-label="Редактирование состава группы"></ol>
        <details class="group-bulk">
          <summary>Ввести список целиком</summary>
          <p>Каждый студент — с новой строки, без номеров. Список заменит текущий состав после сохранения. Совпадающие имена сохранят историю.</p>
          <label class="field-label" for="students">Фамилии и имена</label>
          <textarea id="students" class="text-field" spellcheck="false" placeholder="Иванов Иван\nПетров Пётр"></textarea>
          <button class="button" id="apply-bulk">Применить список к редактору</button>
        </details>
        <p class="group-error" role="alert" id="group-error"></p>
        <div class="group-save-bar">
          <small>При сохранении список сортируется по алфавиту.</small>
          <button class="button primary" id="save-group">Сохранить изменения</button>
        </div>
      </section>
      <div>
        <section class="settings-section">
          <h2>Резервная копия</h2>
          <p>Скачайте все отметки и список группы одним файлом. Копия пригодится при смене телефона или очистке браузера.</p>
          <div class="actions">
            <button class="button" id="backup">Скачать копию</button>
            <button class="button" id="restore">Восстановить из файла</button>
            <input type="file" id="restore-file" aria-label="Файл резервной копии" accept="application/json,.json" hidden>
          </div>
          <p class="group-note">Перед изменением состава группы скачайте копию, чтобы сохранить прежний список и историю отметок.</p>
          <div class="storage-info">Все данные хранятся на этом устройстве в памяти браузера Safari</div>
        </section>
        <section class="settings-section">
          <h2>Рапортичка под рукой</h2>
          <p style="margin-bottom:0">На iPhone откройте сайт в Safari, нажмите «Поделиться» (иконка квадрата со стрелкой вверх) и выберите «На экран “Домой”». Сайт будет открываться как отдельное приложение на весь экран, а все отметки сохраняются на устройстве автоматически.</p>
        </section>
      </div>
    </div>
  `;
  renderDraft();
}

function renderDraft() {
  $('.group-list').innerHTML = draft.map((s, i) => `
    <li>
      <input data-draft="${i}" value="${esc(s.name)}" maxlength="150" aria-label="Имя студента ${i + 1}">
      <button class="group-remove" data-remove="${i}" aria-label="Удалить ${esc(s.name) || 'студента'}">×</button>
    </li>
  `).join('');
  $('#group-total').textContent = `${draft.length} человек`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportExcel() {
  const button = $('#excel');
  button.disabled = true;
  button.textContent = 'Подготовка…';
  try {
    if (!window.ExcelJS) throw new Error('Библиотека Excel не загрузилась. Обновите страницу.');
    const book = createAttendanceWorkbook(window.ExcelJS, state, month);
    download(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Ведомость-${month}.xlsx`);
    notify('Файл Excel подготовлен.');
  } catch (error) {
    notify(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Скачать Excel';
  }
}

async function saveGroup() {
  const name = $('#group-name').value.trim(), error = $('#group-error');
  if (!name || draft.some(s => !s.name.trim())) {
    error.textContent = 'Заполните название группы и имя каждого студента или удалите пустую строку.';
    return;
  }
  if (new Set(draft.map(s => s.name.trim().toLocaleLowerCase('ru'))).size !== draft.length) {
    error.textContent = 'В списке есть одинаковые имена. Добавьте отчество или другое различие.';
    return;
  }
  const removed = state.students.filter(s => !draft.some(d => d.id === s.id));
  if (removed.length && !await confirmAction('Изменить состав группы?', `Из списка будут удалены ${removed.length} студентов и их отметки. Сначала сохраните резервную копию, если история нужна.`)) return;
  if (mutate(next => {
    next.group = name;
    next.demo = false;
    reconcileStudents(next, draft.map(s => ({ ...s, name: s.name.trim() })));
  })) {
    renderGroup();
    renderToday();
    renderSheet();
    $('#header-group').textContent = state.group;
    notify('Состав группы сохранён и отсортирован по алфавиту.');
  }
}

document.addEventListener('input', event => {
  if (event.target.matches('[data-draft]')) draft[Number(event.target.dataset.draft)].name = event.target.value;
  if (event.target.id === 'student-search') { studentQuery = event.target.value; filterRoster(); }
});

async function handleChange(event) {
  const el = event.target;
  if (el.name === 'screen') { navigate(el.id); return; }
  if (el.id === 'light') {
    const theme = el.checked ? 'light' : 'dark';
    if (!mutate(next => next.theme = theme)) el.checked = state.theme === 'light';
    navigation.sync(document.querySelector('input[name="screen"]:checked').id, false);
    return;
  }
  if (el.id === 'mark-date' && el.value) { date = el.value; renderToday(); }
  if (el.id === 'sheet-month' && el.value) { month = el.value; renderSheet(); }
  if (el.name === 'lesson') { lesson = Number(el.value); renderToday(); }
  if (el.dataset.student) {
    const id = el.dataset.student;
    const wasMarked = state.marks[date]?.[lesson]?.includes(id) || state.late?.[date]?.[lesson]?.includes(id);
    if (mutate(next => setAttendance(next, date, lesson, id, wasMarked ? 'present' : 'absent'))) renderToday();
    else el.checked = !!state.marks[date]?.[lesson]?.includes(id);
  }
  if (el.id === 'restore-file' && el.files[0]) {
    try {
      if (el.files[0].size > 5_000_000) throw new Error('Файл слишком большой (максимум 5 МБ).');
      const restored = validateState(JSON.parse(await el.files[0].text()));
      if (await confirmAction('Восстановить резервную копию?', `Текущие данные будут заменены. Группа «${restored.group}», студентов: ${restored.students.length}.`)) {
        const locked = storageLocked;
        storageLocked = false;
        if (persist(restored)) {
          storageError = '';
          renderAll();
          notify('Резервная копия восстановлена.');
        } else storageLocked = locked;
      }
    } catch (error) {
      notify('Не удалось восстановить копию: ' + error.message, true);
    } finally {
      el.value = '';
    }
  }
}
document.addEventListener('change', handleChange);

setupAttendanceGesture(document, controlId => {
  const id = controlId.slice('mark-'.length);
  if (!state.students.some(s => s.id === id)) return;
  const alreadyLate = state.late?.[date]?.[lesson]?.includes(id);
  if (mutate(next => setAttendance(next, date, lesson, id, alreadyLate ? 'present' : 'late'))) {
    renderToday();
    notify(alreadyLate ? 'Отметка опоздания снята.' : 'Опоздание сохранено: 1 академический час пропуска.');
  }
});

document.addEventListener('click', async event => {
  const label = event.target.closest('label[for]');
  if (label && document.getElementById(label.htmlFor)?.matches('input[type="radio"],input[type="checkbox"]')) {
    event.preventDefault();
    const control = document.getElementById(label.htmlFor);
    if (control) {
      control.checked = control.type === 'radio' ? true : !control.checked;
      await handleChange({ target: control });
      if (control.dataset.student) renderToday();
    }
    return;
  }
  const el = event.target.closest('button');
  if (!el) return;
  if (el.id === 'back-top') { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); return; }
  if (el.id === 'reset-search') { const input = $('#student-search'); input.blur(); studentQuery = ''; input.value = ''; filterRoster(); return; }
  if (el.dataset.screen) { navigate(el.dataset.screen); return; }
  if (el.dataset.day) { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + Number(el.dataset.day)); date = dateKey(d); renderToday(); }
  if (el.dataset.month) { const d = new Date(month + '-01T12:00:00'); d.setMonth(d.getMonth() + Number(el.dataset.month)); month = dateKey(d).slice(0, 7); renderSheet(); }
  if (el.dataset.editDay) { date = `${month}-${el.dataset.editDay.padStart(2, '0')}`; navigate('today'); notify(`Открыты отметки: ${prettyDate(date)}. Выберите нужную пару.`); }
  if (el.hasAttribute('data-go-group')) navigate('group');
  if (el.id === 'copy') {
    if (((state.marks[date]?.[lesson] || []).length || (state.late?.[date]?.[lesson] || []).length) && !await confirmAction('Заменить отметки пары?', 'Текущие отметки будут заменены отметками предыдущей пары.')) return;
    if (mutate(next => copyLesson(next, date, lesson))) { renderToday(); notify('Отметки скопированы.'); }
  }
  if (el.id === 'clear' && await confirmAction('Очистить пару?', 'Все студенты на выбранной паре будут отмечены присутствующими.')) {
    if (mutate(next => clearLesson(next, date, lesson))) { renderToday(); notify('Отметки выбранной пары очищены.'); }
  }
  if (el.id === 'add') {
    if (draft.length >= 200) { $('#group-error').textContent = 'Максимум 200 студентов.'; return; }
    draft.push({ id: studentId(), name: '' });
    renderDraft();
    $('.group-list li:last-child input').focus();
  }
  if (el.dataset.remove !== undefined) { draft.splice(Number(el.dataset.remove), 1); renderDraft(); }
  if (el.id === 'apply-bulk') {
    const names = $('#students').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (names.length > 200 || names.some(n => n.length > 150)) { $('#group-error').textContent = 'Не больше 200 студентов, до 150 символов в имени.'; return; }
    draft = names.map(name => ({ id: state.students.find(s => s.name === name)?.id || studentId(), name }));
    renderDraft();
    $('#group-error').textContent = 'Список перенесён в редактор. Нажмите «Сохранить изменения».';
  }
  if (el.id === 'save-group') await saveGroup();
  if (el.id === 'backup') { try { await download(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `Рапортичка-${dateKey()}.json`); } catch {} }
  if (el.id === 'restore') $('#restore-file').click();
  if (el.id === 'print') window.print();
  if (el.id === 'excel') await exportExcel();
});

function renderAll() {
  $('#light').checked = state.theme === 'light';
  $('#header-group').textContent = state.group;
  renderToday();
  renderSheet();
  renderGroup();
}

function syncBackTop() {
  $('#back-top').hidden = window.scrollY < Math.max(480, window.innerHeight * .75);
}

window.addEventListener('scroll', syncBackTop, { passive: true });
window.addEventListener('resize', syncBackTop);

renderAll();
navigate('today');
navigation.sync('today', false);
syncBackTop();
if (storageError) notify(storageError, true);
