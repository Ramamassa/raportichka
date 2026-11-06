// Continuous position between tab centres, shared by dragging and the colour gradient.
export function tabPosition(clientX, centres) {
  if (clientX <= centres[0]) return 0;
  for (let i = 1; i < centres.length; i++) {
    if (clientX <= centres[i]) return i - 1 + (clientX - centres[i - 1]) / (centres[i] - centres[i - 1]);
  }
  return centres.length - 1;
}
export function mixColour(a, b, amount) {
  const channels = hex => hex.replace('#', '').match(/../g).map(value => parseInt(value, 16));
  const start = channels(a), end = channels(b);
  return start.map((value, i) => Math.round(value + (end[i] - value) * amount)).join(' ');
}

export function setupNavigation(nav, navigate) {
  const buttons = [...nav.querySelectorAll('[data-screen]')];
  const indicator = document.createElement('span');
  indicator.className = 'nav-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  nav.prepend(indicator);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 0, position = 0, drag = null, frame = 0, suppressClickUntil = 0;

  function paint(value) {
    position = value;
    const rect = nav.getBoundingClientRect();
    const boxes = buttons.map(button => button.getBoundingClientRect());
    const lower = Math.floor(value), upper = Math.min(lower + 1, buttons.length - 1), fraction = value - lower;
    const interpolate = key => boxes[lower][key] + (boxes[upper][key] - boxes[lower][key]) * fraction;
    const colours = getComputedStyle(nav).getPropertyValue('--nav-palette').trim().split(/\s+/);
    indicator.style.width = `${interpolate('width')}px`;
    indicator.style.height = `${interpolate('height')}px`;
    indicator.style.transform = `translate3d(${interpolate('left') - rect.left - nav.clientLeft}px,0,0)`;
    indicator.style.setProperty('--nav-colour', mixColour(colours[lower], colours[upper], fraction));
  }
  function settle(target, animate = true) {
    cancelAnimationFrame(frame);
    if (!animate || reducedMotion.matches) { paint(target); return; }
    const from = position, started = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - started) / 240);
      paint(from + (target - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  function sync(screen, animate = true) {
    const index = buttons.findIndex(button => button.dataset.screen === screen);
    if (index < 0) return;
    selected = index;
    buttons.forEach((button, i) => {
      if (i === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (!drag) settle(selected, animate);
  }
  function preview(clientX) {
    const centres = buttons.map(button => { const rect = button.getBoundingClientRect(); return rect.left + rect.width / 2; });
    const value = tabPosition(clientX - drag.offset, centres);
    paint(value);
    buttons.forEach((button, i) => button.toggleAttribute('data-preview', i === Math.round(value)));
  }
  nav.addEventListener('pointerdown', event => {
    const button = event.target.closest('[data-screen]');
    if (!event.isPrimary || event.button !== 0 || !buttons.includes(button) || drag) return;
    const boxes = buttons.map(button => button.getBoundingClientRect());
    const centre = index => boxes[index].left + boxes[index].width / 2;
    // Anchor to the pressed tab, not a lens still travelling from the previous tap.
    // Otherwise its old position introduces a full-tab offset into the first drag.
    cancelAnimationFrame(frame);
    drag = { button: buttons.indexOf(button), id: event.pointerId, startX: event.clientX, startY: event.clientY, offset: event.clientX - centre(buttons.indexOf(button)), moved: false };
    // Touch pointers are implicitly captured by the pressed child (often an SVG).
    // Transfer capture before movement; its bubbling lostpointercapture must not cancel us.
    if (event.pointerType === 'touch' || event.pointerType === 'pen') nav.setPointerCapture(event.pointerId);
    suppressClickUntil = 0;
  });
  nav.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4 && !drag.moved) {
      drag.moved = true;
      cancelAnimationFrame(frame);
      nav.classList.add('is-dragging');
      if (!nav.hasPointerCapture(event.pointerId)) nav.setPointerCapture(event.pointerId);
    }
    if (drag.moved) preview(event.clientX);
  });
  function finish(event, cancelled = false) {
    if (event.pointerId !== drag?.id) return;
    if (!cancelled && drag.moved) preview(event.clientX);
    const target = cancelled ? selected : drag.moved ? Math.round(position) : drag.button;
    const { id, moved: dragMoved } = drag;
    drag = null;
    nav.classList.remove('is-dragging');
    buttons.forEach(button => button.removeAttribute('data-preview'));
    if (nav.hasPointerCapture(id)) nav.releasePointerCapture(id);
    // Mouse taps stay native clicks; touch capture can retarget the click to the nav.
    // A completed drag is always committed here, never again by a compatibility click.
    suppressClickUntil = dragMoved || event.pointerType !== 'mouse' ? performance.now() + 450 : 0;
    if (event.pointerType === 'mouse' && !dragMoved && !cancelled) return;
    if (target !== selected) navigate(buttons[target].dataset.screen);
    else settle(selected);
  }
  nav.addEventListener('pointerup', event => finish(event));
  nav.addEventListener('pointercancel', event => finish(event, true));
  nav.addEventListener('lostpointercapture', event => {
    // Ignore the old child's implicit capture being released during transfer.
    if (event.target === nav && !nav.hasPointerCapture(event.pointerId)) finish(event, true);
  });
  nav.addEventListener('contextmenu', event => event.preventDefault());
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-screen]');
    if (!button) return;
    event.stopPropagation();
    if (event.detail && performance.now() < suppressClickUntil) { event.preventDefault(); return; }
    navigate(button.dataset.screen);
  });
  nav.addEventListener('keydown', event => {
    const index = buttons.indexOf(event.target);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[target].focus();
    navigate(buttons[target].dataset.screen);
  });
  new ResizeObserver(() => { if (!drag) settle(selected, false); }).observe(nav);
  return { sync };
}
