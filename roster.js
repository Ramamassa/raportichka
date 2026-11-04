// Search is independent of attendance: hidden students retain their marks.
const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е').trim();
export function matchesStudent(name, query) {
  const text = normalize(name);
  return normalize(query).split(/\s+/).every(part => text.includes(part));
}
// randomUUID needs HTTPS; getRandomValues also works on a local-network HTTP page.
export function studentId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return 'student-' + Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
}
