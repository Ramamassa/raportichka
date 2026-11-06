// Delegated so a roster render does not replace gesture listeners.
export function setupAttendanceGesture(root, markLate, { delay = 500, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let press = null, suppress = null;
  const labelFor = target => target.closest?.('.student label');
  function stop() { if (press) cancel(press.timer); press = null; }
  root.addEventListener('pointerdown', event => {
    stop();
    const label = labelFor(event.target);
    if (!label || !event.isPrimary || event.button !== 0) return;
    suppress = null;
    const current = { id: event.pointerId, x: event.clientX, y: event.clientY, label };
    press = current;
    current.timer = schedule(() => {
      if (press !== current) return;
      suppress = label.htmlFor;
      schedule(() => { if (suppress === label.htmlFor) suppress = null; }, 1000);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(40); } catch {}
      }
      markLate(label.htmlFor);
    }, delay);
  });
  root.addEventListener('pointermove', event => {
    if (event.pointerId === press?.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) stop();
  });
  root.addEventListener('pointerup', stop);
  root.addEventListener('pointercancel', () => { stop(); suppress = null; });
  root.addEventListener('contextmenu', event => { if (labelFor(event.target)) event.preventDefault(); });
  root.addEventListener('click', event => {
    if (suppress) {
      const label = labelFor(event.target);
      if (!label || label.htmlFor === suppress) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppress = null;
      }
    }
  }, true);
  // Keyboard equivalent: Shift+Space on the student's checkbox.
  root.addEventListener('keydown', event => {
    if (event.shiftKey && event.code === 'Space' && event.target?.matches?.('[data-student]')) {
      event.preventDefault();
      markLate(event.target.id);
    }
  });
}
