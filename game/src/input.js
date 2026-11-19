// SOLMAR HEAT — keyboard input state with edge detection.
const down = new Set();
const pressed = new Set();
let anyKey = false;

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  down.add(e.code);
  anyKey = true;
});
window.addEventListener('keyup', (e) => down.delete(e.code));
window.addEventListener('blur', () => { down.clear(); });

export const Input = {
  isDown(code) { return down.has(code); },
  // True once for the frame in which the key went down.
  wasPressed(code) { return pressed.has(code); },
  anyKey() { return anyKey; },
  // Axis helpers: -1 / 0 / +1.
  drive() {
    let v = 0;
    if (down.has('KeyW') || down.has('ArrowUp')) v += 1;
    if (down.has('KeyS') || down.has('ArrowDown')) v -= 1;
    return v;
  },
  steer() {
    let v = 0;
    if (down.has('KeyA') || down.has('ArrowLeft')) v -= 1;
    if (down.has('KeyD') || down.has('ArrowRight')) v += 1;
    return v;
  },
  moveX() {
    let v = 0;
    if (down.has('KeyA') || down.has('ArrowLeft')) v -= 1;
    if (down.has('KeyD') || down.has('ArrowRight')) v += 1;
    return v;
  },
  moveY() {
    let v = 0;
    if (down.has('KeyW') || down.has('ArrowUp')) v -= 1;
    if (down.has('KeyS') || down.has('ArrowDown')) v += 1;
    return v;
  },
  run() { return down.has('ShiftLeft') || down.has('ShiftRight'); },
  // Call at the end of each frame.
  endFrame() { pressed.clear(); anyKey = false; },
};
