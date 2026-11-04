export const KEY = 'group-journal.v1';
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const daysInMonth = month => new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
export function initialState() {
  const names = ['Абрамова Алина','Белова Дарья','Васильев Артём','Волкова Мария','Громов Никита','Данилова Софья','Егорова Полина','Зайцев Максим','Иванова Анна','Козлов Илья','Лебедева Ева','Морозов Даниил'];
  return { version:1, group:'ИС-23', demo:true, students:names.map((name,i)=>({id:`student-${i+1}`,name})), marks:{}, theme:'dark' };
}
export function validateState(value) {
  if (!value || value.version !== 1 || typeof value.group !== 'string' || !value.group.trim() || value.group.length > 80 || !Array.isArray(value.students) || value.students.length > 200 || !value.marks || typeof value.marks !== 'object' || Array.isArray(value.marks)) throw new Error('Неверный формат резервной копии.');
  const ids = new Set();
  for (const s of value.students) {
    if (!s || typeof s.id !== 'string' || !/^[\w-]{1,80}$/.test(s.id) || ids.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 150) throw new Error('Некорректный список студентов.');
    ids.add(s.id);
  }
  for (const [date, lessons] of Object.entries(value.marks)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || dateKey(new Date(date+'T12:00:00')) !== date || !lessons || typeof lessons !== 'object' || Array.isArray(lessons)) throw new Error('Некорректная дата отметок.');
    for (const [lesson, absent] of Object.entries(lessons)) if (!/^[1-6]$/.test(lesson) || !Array.isArray(absent) || absent.some(id => !ids.has(id)) || new Set(absent).size !== absent.length) throw new Error('Некорректные отметки в копии.');
  }
  return { version:1, group:value.group, students:value.students.map(s=>({id:s.id,name:s.name})), marks:JSON.parse(JSON.stringify(value.marks)), theme:value.theme === 'light' ? 'light':'dark', demo:!!value.demo };
}
export function setAbsence(state,date,lesson,id,absent) {
  const current = new Set(state.marks[date]?.[lesson] || []);
  absent ? current.add(id) : current.delete(id);
  (state.marks[date] ??= {})[lesson] = [...current];
}
export function dayHours(state,date,id) { return Object.values(state.marks[date] || {}).filter(ids=>ids.includes(id)).length * 2; }
export function monthRows(state,month) { return [...state.students].sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(s=>{const days=Array.from({length:daysInMonth(month)},(_,i)=>dayHours(state,`${month}-${String(i+1).padStart(2,'0')}`,s.id));return {...s,days,total:days.reduce((a,b)=>a+b,0)};}); }
export function reconcileStudents(state, students) {
  const ids = new Set(students.map(s=>s.id));
  state.students = students.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  for (const lessons of Object.values(state.marks)) for (const key of Object.keys(lessons)) lessons[key] = lessons[key].filter(id=>ids.has(id));
}
