// Drag-to-bucket for mouse and touch. See CLAUDE.md "Drag rules": these are
// deliberate and hard-won. In short:
//  - No Pointer Events, no setPointerCapture.
//  - One coordinate core (startDragAt / moveTo / endDrag) with thin mouse and
//    touch wrappers. Rendering and drop logic are shared.
//  - touchmove/touchend/touchcancel are native document listeners with
//    { passive: false } (React's root touch listeners are passive, so
//    preventDefault in onTouchMove would silently fail).
//  - The drop target is hit-tested only while moving, stored synchronously in
//    a ref, and the drop reads that ref: never React state, never a fresh
//    hit-test at touchend.
//  - Only the initiating touch identifier is followed.
//  - After any touch ends, mouse events are ignored for ~500ms (browsers
//    synthesize mouse events after touchend).
//  - Movement under a small threshold is a tap (selection), not a drag.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';

/** Movement (px) before a press becomes a drag. Below it, it's a tap. */
export const DRAG_THRESHOLD = 8;
/** How long mouse events are ignored after a touch ends. */
export const MOUSE_IGNORE_MS = 500;
/** Touch preview sits this far above the finger, so the finger doesn't hide it. */
export const TOUCH_PREVIEW_GAP = 28;

type Source = 'mouse' | 'touch';

interface Session {
  z: number;
  source: Source;
  touchId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Mouse: where in the tile it was grabbed, so the preview doesn't jump. */
  grabX: number;
  grabY: number;
  width: number;
  height: number;
  active: boolean;
  savedUserSelect: string;
  savedCursor: string;
}

interface Options {
  /** A drag ended. bucket is null when released outside every bucket. */
  onDrop: (z: number, bucket: string | null) => void;
  /** A touch press that never passed the threshold. */
  onTap: (z: number) => void;
  /** A press passed the threshold and became a drag. */
  onDragStart?: (z: number) => void;
}

function bucketAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>('[data-bucket]')?.dataset.bucket ?? null;
}

/** Tiles carry their z in data-tray-z, so handlers need no per-tile closure. */
function tileZ(el: HTMLElement): number | null {
  const z = Number(el.dataset.trayZ);
  return Number.isInteger(z) ? z : null;
}

function findTouch(list: TouchList, id: number | null): Touch | null {
  for (let i = 0; i < list.length; i++) {
    const t = list.item(i);
    if (t && t.identifier === id) return t;
  }
  return null;
}

export function useBucketDrag({ onDrop, onTap, onDragStart }: Options) {
  const session = useRef<Session | null>(null);
  const hoverRef = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  /** Callback ref for the preview element (keeps the ref object out of render). */
  const setPreviewEl = useCallback((el: HTMLDivElement | null) => {
    previewRef.current = el;
  }, []);
  const ignoreMouseUntil = useRef(0);
  const suppressClick = useRef(false);
  const detach = useRef<() => void>(() => {});

  // Latest callbacks, so native listeners never call stale closures.
  const cb = useRef({ onDrop, onTap, onDragStart });
  useLayoutEffect(() => {
    cb.current = { onDrop, onTap, onDragStart };
  });

  // Render-only mirrors of the refs (the preview and the hovered bucket).
  const [draggingZ, setDraggingZ] = useState<number | null>(null);
  const [hoverBucket, setHoverBucket] = useState<string | null>(null);

  const positionPreview = useCallback(() => {
    const s = session.current;
    const el = previewRef.current;
    if (!s || !el) return;
    const x = s.source === 'touch' ? s.lastX - s.width / 2 : s.lastX - s.grabX;
    const y = s.source === 'touch' ? s.lastY - s.height - TOUCH_PREVIEW_GAP : s.lastY - s.grabY;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }, []);

  // The preview mounts on the render after a drag activates: place it at once.
  useLayoutEffect(() => {
    if (draggingZ !== null) positionPreview();
  }, [draggingZ, positionPreview]);

  const restoreBody = (s: Session) => {
    document.body.style.userSelect = s.savedUserSelect;
    document.body.style.cursor = s.savedCursor;
  };

  /** Shared end of every drag. drop=false ends without judging (cancel). */
  const endDrag = useCallback((drop: boolean) => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    detach.current();
    detach.current = () => {};
    const target = hoverRef.current;
    hoverRef.current = null;
    if (!s.active) return;
    restoreBody(s);
    setDraggingZ(null);
    setHoverBucket(null);
    cb.current.onDrop(s.z, drop ? target : null);
  }, []);

  /** Shared move. Returns whether a drag is active after this move. */
  const moveTo = useCallback((x: number, y: number): boolean => {
    const s = session.current;
    if (!s) return false;
    s.lastX = x;
    s.lastY = y;
    if (!s.active) {
      if (Math.hypot(x - s.startX, y - s.startY) < DRAG_THRESHOLD) return false;
      s.active = true;
      s.savedUserSelect = document.body.style.userSelect;
      s.savedCursor = document.body.style.cursor;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      setDraggingZ(s.z);
      cb.current.onDragStart?.(s.z);
    }
    // Hit-test while moving, and store the result synchronously.
    const b = bucketAt(x, y);
    if (b !== hoverRef.current) {
      hoverRef.current = b;
      setHoverBucket(b);
    }
    positionPreview();
    return true;
  }, [positionPreview]);

  /** The coordinate core: every drag, mouse or touch, starts here. */
  const startDragAt = useCallback(
    (tile: { z: number; el: HTMLElement }, x: number, y: number, source: Source, touchId: number | null) => {
      const r = tile.el.getBoundingClientRect();
      session.current = {
        z: tile.z,
        source,
        touchId,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        grabX: x - r.left,
        grabY: y - r.top,
        width: r.width,
        height: r.height,
        active: false,
        savedUserSelect: '',
        savedCursor: '',
      };
      hoverRef.current = null;
    },
    [],
  );

  // ---- touch wrapper ----
  const onTouchStart = useCallback(
    (ev: ReactTouchEvent<HTMLElement>) => {
      const z = tileZ(ev.currentTarget);
      if (z === null) return;
      if (session.current) return; // a drag is already running: a second finger can't start another
      // The touch that just went down is the initiator. Only its identifier is followed from here on.
      const t = ev.changedTouches.item(0);
      if (!t) return;
      const id = t.identifier;
      startDragAt({ z, el: ev.currentTarget }, t.clientX, t.clientY, 'touch', id);

      const move = (e: TouchEvent) => {
        const mine = findTouch(e.changedTouches, id);
        if (!mine) return; // another finger moved
        if (moveTo(mine.clientX, mine.clientY) && e.cancelable) e.preventDefault();
      };
      const end = (e: TouchEvent) => {
        if (!findTouch(e.changedTouches, id)) return; // another finger lifted
        const s = session.current;
        ignoreMouseUntil.current = performance.now() + MOUSE_IGNORE_MS;
        // Stop the browser synthesizing mousedown/mouseup/click for this touch.
        if (e.cancelable) e.preventDefault();
        if (s?.active) {
          endDrag(true);
        } else {
          endDrag(false);
          cb.current.onTap(z);
        }
      };
      const cancel = (e: TouchEvent) => {
        if (!findTouch(e.changedTouches, id)) return;
        ignoreMouseUntil.current = performance.now() + MOUSE_IGNORE_MS;
        endDrag(false);
      };
      // Native and non-passive, so preventDefault works (React's root touch listeners are passive).
      const opts: AddEventListenerOptions = { passive: false };
      document.addEventListener('touchmove', move, opts);
      document.addEventListener('touchend', end, opts);
      document.addEventListener('touchcancel', cancel, opts);
      detach.current = () => {
        // Removal matches on capture only, which is false for all three.
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', end);
        document.removeEventListener('touchcancel', cancel);
      };
    },
    [startDragAt, moveTo, endDrag],
  );

  // ---- mouse wrapper ----
  const onMouseDown = useCallback(
    (ev: ReactMouseEvent<HTMLElement>) => {
      const z = tileZ(ev.currentTarget);
      if (z === null || ev.button !== 0 || session.current) return;
      if (performance.now() < ignoreMouseUntil.current) return; // synthesized after a touch
      startDragAt({ z, el: ev.currentTarget }, ev.clientX, ev.clientY, 'mouse', null);

      const move = (e: MouseEvent) => {
        moveTo(e.clientX, e.clientY);
      };
      const up = () => {
        const wasDrag = session.current?.active ?? false;
        endDrag(wasDrag);
        if (wasDrag) {
          // The click that follows mouseup must not also select or place.
          suppressClick.current = true;
          window.setTimeout(() => {
            suppressClick.current = false;
          }, 0);
        }
      };
      const key = (e: KeyboardEvent) => {
        if (e.key === 'Escape') endDrag(false);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.addEventListener('keydown', key);
      detach.current = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.removeEventListener('keydown', key);
      };
    },
    [startDragAt, moveTo, endDrag],
  );

  /**
   * Guard for onClick on tiles and buckets. Keyboard activation (detail 0)
   * always counts. Pointer clicks are ignored right after a drag, and during
   * the post-touch window when they are the browser's synthesized echo.
   */
  const shouldIgnoreClick = useCallback((ev: ReactMouseEvent) => {
    if (ev.detail === 0) return false;
    return suppressClick.current || performance.now() < ignoreMouseUntil.current;
  }, []);

  // Unmount mid-drag (range switch, game switch): detach and restore the body.
  useEffect(
    () => () => {
      const s = session.current;
      session.current = null;
      detach.current();
      if (s?.active) restoreBody(s);
    },
    [],
  );

  return { onTouchStart, onMouseDown, shouldIgnoreClick, draggingZ, hoverBucket, setPreviewEl };
}
