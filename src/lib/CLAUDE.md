# src/lib — drag engine rules

Loaded when working under `src/lib/`. The root CLAUDE.md points here for any drag interaction in the project.

## Drag rules (apply to any drag interaction in this project)

Hard-won in an earlier project's touch drag, and not negotiable. They're implemented in `src/lib/useBucketDrag.ts`.

1. **No Pointer Events and no `setPointerCapture`.** That model was abandoned after real pain.
2. **One coordinate core**: `startDragAt(tile, x, y)` → `moveTo(x, y)` → `endDrag(drop)`. Thin mouse and touch wrappers only extract coordinates. Rendering and drop logic are shared, never duplicated per input type.
3. **`touchmove`, `touchend` and `touchcancel` are native `document.addEventListener` calls with `{ passive: false }`.** React's root touch listeners are passive, so `preventDefault` inside `onTouchMove` silently fails. `onTouchStart` can stay a React prop.
4. **Hit-test with `document.elementFromPoint` only while moving** (touch has implicit capture). Resolve it with `.closest('[data-bucket]')` and store it in a ref **synchronously**. The drop reads that ref, never React state and never a fresh hit-test at touchend. (Stale hover state caused a real drop-target race before.) React state mirrors the ref only to highlight the hovered bucket.
5. **Follow the initiating touch's `identifier`.** Find it in `changedTouches`, and never index `touches[0]`. A second finger can't start, move or end the drag.
6. **Handle `touchcancel`**: end without judging (back to the tray, not a mistake) and restore `body.style.userSelect` and `cursor`. Unmounting mid-drag also restores them.
7. **After any touch ends, ignore mouse events for ~500ms** (`MOUSE_IGNORE_MS`), because browsers synthesize mouse events after touchend, which would start or drop a tile twice. `touchend` also calls `preventDefault`. Click handlers ignore pointer clicks (`detail > 0`) inside the window, but keyboard clicks (`detail === 0`) always count.
8. **`touch-action: none` on draggable tiles only**, so the page still scrolls when a finger starts anywhere else.
9. **The touch preview sits above the finger** (`TOUCH_PREVIEW_GAP`), not centered under it. The mouse preview keeps the grab point.
10. **A drop outside every target** returns the item and is not a mistake.
11. **Movement under `DRAG_THRESHOLD` (8px) is a tap**, meaning selection, not a drag. A touch tap selects in the touchend handler, and a mouse tap is left to `onClick`. After a real mouse drag, the click that follows is suppressed.
12. **Tap-to-place works with no drag code at all.** Selection and placement live in `onClick` (keyboard, mouse click, screen readers). Drag is an extra path, never the only one.

Checked by mutation testing:
- Removing the 500ms window, following `touches[0]`, or skipping the body-style restore each makes a touch e2e test fail.
- Making touchmove passive is caught only by the console-error check (Chromium logs "Unable to preventDefault inside passive event listener"). The page itself didn't misbehave, because `touch-action: none` on the tiles already blocks scrolling in Chromium. Keep `passive: false` anyway: it's the defense for browsers whose touch-action support differs.
