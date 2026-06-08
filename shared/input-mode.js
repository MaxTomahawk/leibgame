const STORAGE_KEY = 'leib_input_mode';

/** @readonly */
export const InputMode = Object.freeze({
  TOUCH: 'touch',
  POINTER: 'pointer'
});

function inferInputMode () {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const hover = window.matchMedia('(hover: hover)').matches;
  const touchPoints = navigator.maxTouchPoints || 0;

  if (coarse && !fine) return InputMode.TOUCH;
  if (!hover && touchPoints > 0) return InputMode.TOUCH;
  return InputMode.POINTER;
}

/** @returns {'touch' | 'pointer'} */
export function getInputMode () {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === InputMode.TOUCH || stored === InputMode.POINTER) return stored;
  } catch (_e) { /* ignore */ }
  return inferInputMode();
}

/** @param {'touch' | 'pointer'} mode */
export function setInputMode (mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (_e) { /* ignore */ }
}

/** @param {'touch' | 'pointer'} [mode] */
export function isTouchInputMode (mode = getInputMode()) {
  return mode === InputMode.TOUCH;
}

/**
 * Refine input mode from actual pointer events; persists choice in localStorage.
 * @param {(mode: 'touch' | 'pointer') => void} onChange
 */
export function watchInputMode (onChange) {
  let current = getInputMode();

  const apply = (mode) => {
    if (mode !== InputMode.TOUCH && mode !== InputMode.POINTER) return;
    if (mode === current) return;
    current = mode;
    setInputMode(mode);
    onChange(mode);
  };

  const onPointerDown = (event) => {
    if (event.pointerType === 'touch') apply(InputMode.TOUCH);
    else if (event.pointerType === 'mouse' || event.pointerType === 'pen') apply(InputMode.POINTER);
  };

  window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });

  return () => {
    window.removeEventListener('pointerdown', onPointerDown, { capture: true });
  };
}
