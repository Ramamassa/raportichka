import test from 'node:test';
import assert from 'node:assert/strict';
import { tabPosition, mixColour, setupNavigation } from '../navigation.js';

test('drag position is continuous and clamps at both ends', () => {
  const centres = [60, 170, 280];
  assert.equal(tabPosition(-100, centres), 0);
  assert.equal(tabPosition(60, centres), 0);
  assert.equal(tabPosition(115, centres), .5);
  assert.equal(tabPosition(170, centres), 1);
  assert.equal(tabPosition(225, centres), 1.5);
  assert.equal(tabPosition(900, centres), 2);
});
test('colour blends continuously between warm tab colours', () => {
  assert.equal(mixColour('#dec18b', '#afbd96', 0), '222 193 139');
  assert.equal(mixColour('#dec18b', '#afbd96', .5), '199 191 145');
  assert.equal(mixColour('#dec18b', '#afbd96', 1), '175 189 150');
});
test('pointer drag commits once, cancellation restores selection, keyboard and clicks work', () => {
  const listeners = {}, attrs = () => new Map();
  const buttons = ['today', 'sheet', 'group'].map((screen, i) => ({
    dataset: { screen }, attributes: attrs(),
    getBoundingClientRect: () => ({ left: 10 + i * 110, width: 100, height: 52 }),
    setAttribute(key, value) { this.attributes.set(key, value); },
    removeAttribute(key) { this.attributes.delete(key); },
    toggleAttribute(key, on) { if (on) this.attributes.set(key, ''); else this.attributes.delete(key); },
    focus() {}, closest() { return this; }
  }));
  let captured = null, indicator;
  const nav = {
    clientLeft: 1, classList: { add() {}, remove() {} },
    querySelectorAll: () => buttons, prepend: value => { indicator = value; },
    getBoundingClientRect: () => ({ left: 0 }),
    addEventListener: (type, listener) => { listeners[type] = listener; },
    setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id,
    releasePointerCapture: () => { captured = null; }
  };
  const motion = { matches: true }, frames = [];
  const originals = Object.fromEntries(['document','matchMedia','getComputedStyle','ResizeObserver','MutationObserver','cancelAnimationFrame','requestAnimationFrame'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, {
    document: { createElement: () => ({ style: { setProperty(key, value) { this[key] = value; } }, setAttribute() {} }), querySelector: () => ({ addEventListener() {} }) },
    matchMedia: () => motion,
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    getComputedStyle: () => ({ getPropertyValue: () => '#dec18b #afbd96 #e0aa95' }),
    ResizeObserver: class { observe() {} }, MutationObserver: class { observe() {} },
    cancelAnimationFrame(id) { if (id) frames[id - 1] = null; }
  });
  try {
    const calls = [];
    const controller = setupNavigation(nav, screen => { calls.push(screen); controller.sync(screen); });
    controller.sync('today', false);
    const pointer = (x, target = buttons[0]) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: 20, target, preventDefault() {} });
    listeners.pointerdown(pointer(60));
    assert.equal(captured, 7, 'capture belongs to the nav before the first move');
    listeners.lostpointercapture({ ...pointer(60), target: buttons[0] });
    listeners.pointermove(pointer(225));
    assert.equal(indicator.style['--nav-colour'], '200 180 150');
    assert.deepEqual(calls, [], 'dragging previews without changing the screen');
    listeners.pointerup(pointer(280));
    assert.deepEqual(calls, ['group']);
    listeners.click({ target: buttons[0], detail: 1, stopPropagation() {}, preventDefault() {} });
    assert.deepEqual(calls, ['group'], 'synthetic click after capture must not undo the drag');
    listeners.pointerdown(pointer(280, buttons[2]));
    listeners.pointermove(pointer(60, buttons[2]));
    listeners.pointercancel(pointer(60, buttons[2]));
    assert.equal(buttons[2].attributes.get('aria-current'), 'page');
    assert.equal(indicator.style.transform, 'translate3d(229px,0,0)');
    listeners.keydown({ target: buttons[2], key: 'Home', preventDefault() {} });
    assert.equal(calls.at(-1), 'today');
    listeners.click({ target: buttons[1], detail: 0, stopPropagation() {} });
    assert.equal(calls.at(-1), 'sheet');
    // Any button can start a drag, without jumping the lens on pointerdown.
    const before = indicator.style.transform;
    listeners.pointerdown(pointer(60, buttons[0]));
    assert.equal(indicator.style.transform, before);
    listeners.pointermove(pointer(170, buttons[0]));
    assert.equal(indicator.style.transform, 'translate3d(229px,0,0)');
    listeners.pointerup(pointer(170, buttons[0]));
    assert.equal(calls.at(-1), 'group');
    // Losing the nav's own capture really does cancel and snap back.
    listeners.pointerdown(pointer(280, buttons[2]));
    listeners.pointermove(pointer(115, buttons[2]));
    captured = null;
    listeners.lostpointercapture({ ...pointer(115), target: nav });
    assert.equal(indicator.style.transform, 'translate3d(229px,0,0)');
    listeners.click({ target: buttons[0], detail: 0, stopPropagation() {} });
    assert.equal(calls.at(-1), 'today');
    const count = calls.length - 1;
    // A stationary touch on the active tab leaves selection to the normal click.
    listeners.pointerdown(pointer(60));
    listeners.pointerup(pointer(60));
    assert.equal(calls.length, count + 1);
    listeners.click({ target: buttons[0], detail: 1, stopPropagation() {}, preventDefault() {} });
    assert.equal(calls.length, count + 1);
    // With motion enabled a click starts from the existing lens, not a pointerdown jump.
    motion.matches = false;
    const start = indicator.style.transform;
    listeners.pointerdown(pointer(280, buttons[2]));
    listeners.pointerup(pointer(280, buttons[2]));
    assert.equal(indicator.style.transform, start);
    const started = performance.now();
    listeners.click({ target: buttons[2], detail: 1, stopPropagation() {}, preventDefault() {} });
    assert.equal(indicator.style.transform, start);
    const tick = frames.findLast(callback => callback);
    tick(started + 120);
    assert.notEqual(indicator.style.transform, start);
    assert.notEqual(indicator.style.transform, 'translate3d(229px,0,0)');
    frames.findLast(callback => callback)(started + 300);
    assert.equal(indicator.style.transform, 'translate3d(229px,0,0)');
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
