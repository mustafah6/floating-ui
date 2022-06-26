import * as React from 'react';
import type {
  UseFloatingReturn,
  SideObject,
  DetectOverflowOptions,
  Middleware,
  FloatingContext,
  ElementProps,
} from './types';
import {detectOverflow, offset} from '.';
import {flushSync} from 'react-dom';
import {getUserAgent} from './utils/getPlatform';
import {useLatestRef} from './utils/useLatestRef';

export const inner = (
  options: {
    listRef: React.MutableRefObject<Array<HTMLElement | null>>;
    index: number;
    onFallbackChange?: null | ((fallback: boolean) => void);
    offset?: number;
    overflowRef?: React.MutableRefObject<SideObject | null>;
    minHeight?: number;
    referenceOverflowThreshold?: number;
  } & Partial<DetectOverflowOptions>
): Middleware => ({
  name: 'inner',
  options,
  async fn(middlewareArguments) {
    const {
      listRef,
      overflowRef,
      onFallbackChange,
      offset: innerOffset = 0,
      index = 0,
      minHeight = 100,
      referenceOverflowThreshold = 0,
      ...detectOverflowOptions
    } = options;

    const {
      rects,
      elements: {floating},
    } = middlewareArguments;

    if (floating.style.maxHeight) {
      floating.style.maxHeight = '';
      return {
        reset: {
          rects: true,
        },
      };
    }

    const item = listRef.current[index];

    if (__DEV__) {
      if (!middlewareArguments.placement.startsWith('bottom')) {
        console.warn(
          [
            'Floating UI: `placement` side must be "bottom" when using the',
            '`inner` middleware.',
          ].join(' ')
        );
      }
    }

    if (!item) {
      if (__DEV__) {
        console.warn(
          [
            `Floating UI: Item with index ${index} does not exist and cannot`,
            `be aligned.`,
          ].join(' ')
        );
      }

      return {};
    }

    const nextArgs = {
      ...middlewareArguments,
      ...(await offset(
        -item.offsetTop -
          rects.reference.height / 2 -
          item.offsetHeight / 2 -
          innerOffset
      ).fn(middlewareArguments)),
    };

    const overflow = await detectOverflow(nextArgs, detectOverflowOptions);
    const refOverflow = await detectOverflow(nextArgs, {
      ...detectOverflowOptions,
      elementContext: 'reference',
    });

    const diffY = Math.max(0, overflow.top);
    const nextY = nextArgs.y + diffY;

    const maxHeight = Math.max(
      0,
      floating.scrollHeight - diffY - Math.max(0, overflow.bottom)
    );

    floating.style.maxHeight = `${maxHeight}px`;
    floating.scrollTop = diffY;

    // There is not enough space, fallback to standard anchored positioning
    if (onFallbackChange) {
      if (
        floating.offsetHeight < minHeight ||
        refOverflow.top >= -referenceOverflowThreshold ||
        refOverflow.bottom >= -referenceOverflowThreshold
      ) {
        onFallbackChange(true);
      } else {
        onFallbackChange(false);
      }
    }

    if (overflowRef) {
      overflowRef.current = await detectOverflow(
        {
          ...nextArgs,
          y: nextY,
          rects: {
            ...rects,
            floating: {
              ...rects.floating,
              height: floating.offsetHeight,
            },
          },
        },
        detectOverflowOptions
      );
    }

    return {
      y: nextY,
    };
  },
});

export const useInnerOffset = (
  {open, refs}: FloatingContext,
  {
    enabled = true,
    overflowRef,
    onChange,
  }: {
    enabled?: boolean;
    overflowRef: React.MutableRefObject<SideObject | null>;
    onChange: (offset: number | ((offset: number) => number)) => void;
  }
): ElementProps => {
  const onChangeRef = useLatestRef(onChange);
  const controlledScrollingRef = React.useRef(false);
  const prevScrollTopRef = React.useRef<number | null>(null);

  // Touch devices don't have `wheel` which has a momentum-based deltaY value,
  // so we need to add custom momentum scrolling to `touchmove`. This allows
  // the maxHeight expansion to have inertial scrolling.
  useTouchMomentumExpandOffset(onChange, {
    open,
    refs,
    overflowRef,
    enabled,
  });

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    function onWheel(e: WheelEvent) {
      if (
        e.ctrlKey ||
        !el ||
        el.scrollHeight <= el.offsetHeight ||
        overflowRef.current == null
      ) {
        return;
      }

      const dY = e.deltaY;

      const isAtTop = overflowRef.current.top >= -0.5;
      const isAtBottom = overflowRef.current.bottom >= -0.5;

      if ((!isAtTop && dY > 0) || (!isAtBottom && dY < 0)) {
        e.preventDefault();
        flushSync(() => onChangeRef.current((d) => d + dY));
      } else if (/firefox/i.test(getUserAgent())) {
        // Needed to propagate scrolling during momentum scrolling phase once
        // it gets limited by the boundary. UX improvement, not critical.
        el.scrollTop += dY;
      }
    }

    const el = refs.floating.current;

    if (open && el) {
      el.addEventListener('wheel', onWheel);

      // Wait for the position to be ready.
      requestAnimationFrame(() => {
        prevScrollTopRef.current = el.scrollTop;
      });

      return () => {
        prevScrollTopRef.current = null;
        el.removeEventListener('wheel', onWheel);
      };
    }
  }, [enabled, open, refs, overflowRef, onChangeRef]);

  if (!enabled) {
    return {};
  }

  return {
    floating: {
      onKeyDown() {
        controlledScrollingRef.current = true;
      },
      onWheel() {
        controlledScrollingRef.current = false;
      },
      onTouchMove() {
        controlledScrollingRef.current = false;
      },
      onScroll() {
        const el = refs.floating.current;

        if (!overflowRef.current || !el || !controlledScrollingRef.current) {
          return;
        }

        if (prevScrollTopRef.current !== null) {
          const scrollDiff = el.scrollTop - prevScrollTopRef.current;

          if (
            (overflowRef.current.bottom < -0.5 && scrollDiff < 0) ||
            (overflowRef.current.top < -0.5 && scrollDiff > 0)
          ) {
            flushSync(() => onChange((d) => d + scrollDiff));
          }
        }

        prevScrollTopRef.current = el.scrollTop;
      },
    },
  };
};

// Adapted from https://github.com/ariya/kinetic/blob/master/2/scroll.js
function useTouchMomentumExpandOffset(
  onChange: React.Dispatch<React.SetStateAction<number>>,
  {
    open,
    refs,
    overflowRef,
    enabled,
  }: {
    open: boolean;
    refs: UseFloatingReturn['refs'];
    overflowRef: React.MutableRefObject<SideObject | null>;
    enabled: boolean;
  }
) {
  const onChangeRef = useLatestRef(onChange);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const timeConstant = 325;
    let offset = 0;
    let velocity = 0;
    let amplitude = 0;
    let frame = 0;
    let ticker = 0;
    let target = 0;
    let autoScroll = 0;
    let timestamp = 0;
    let reference = 0;
    let pressed = false;
    let cancel = false;

    function isExpandable() {
      if (overflowRef.current) {
        return (
          overflowRef.current.top !== 0 || overflowRef.current.bottom !== 0
        );
      }

      return false;
    }

    function yPos(e: any) {
      // touch event
      if (e.targetTouches && e.targetTouches.length >= 1) {
        return e.targetTouches[0].clientY;
      }

      // mouse event
      return e.clientY;
    }

    function scroll(y: number) {
      if (overflowRef.current && el) {
        if (
          (overflowRef.current.top < -0.5 && y < offset) ||
          (overflowRef.current.bottom < -0.5 && y > offset)
        ) {
          return;
        }

        offset = y;
        flushSync(() => onChangeRef.current(offset));
      }
    }

    function track() {
      const now = Date.now();
      const elapsed = now - timestamp;
      const delta = offset - frame;
      const v = (1000 * delta) / (1 + elapsed);

      timestamp = now;
      frame = offset;
      velocity = 0.8 * v + 0.2 * velocity;
      ticker = requestAnimationFrame(track);
    }

    function autoScrollFrame() {
      if (amplitude && !cancel && overflowRef.current) {
        const elapsed = Date.now() - timestamp;
        const delta = -amplitude * Math.exp(-elapsed / timeConstant);

        if (delta > 0 && overflowRef.current.top < -0.5) {
          offset -= overflowRef.current.top;
          flushSync(() => onChangeRef.current(offset));
          return;
        }

        if (delta < 0 && overflowRef.current.bottom < -0.5) {
          offset += overflowRef.current.bottom;
          flushSync(() => onChangeRef.current(offset));
          return;
        }

        if (delta > 0.5 || delta < -0.5) {
          scroll(target + delta);
          autoScroll = requestAnimationFrame(autoScrollFrame);
        } else {
          scroll(target);
        }
      }
    }

    function tap(e: TouchEvent) {
      pressed = true;
      reference = yPos(e);
      velocity = amplitude = 0;
      timestamp = Date.now();

      cancelAnimationFrame(ticker);
      ticker = requestAnimationFrame(track);

      if (!isExpandable()) {
        cancel = true;
      }
    }

    function drag(e: TouchEvent) {
      if (pressed && !cancel) {
        const y = yPos(e);
        const delta = reference - y;
        if (delta > 2 || delta < -2) {
          reference = y;
          scroll(offset + delta);
        }
      }

      if (isExpandable() && e.cancelable && !cancel) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    function release() {
      pressed = false;
      cancelAnimationFrame(ticker);

      if (velocity > 5 || velocity < -5) {
        amplitude = 0.8 * velocity;
        target = Math.round(offset + amplitude);
        timestamp = Date.now();
        autoScroll = requestAnimationFrame(autoScrollFrame);
      }
    }

    const el = refs.floating.current;

    if (el && open) {
      el.addEventListener('touchstart', tap, {passive: false});
      el.addEventListener('touchmove', drag, {passive: false});
      el.addEventListener('touchend', release);

      return () => {
        cancelAnimationFrame(ticker);
        cancelAnimationFrame(autoScroll);
        el.removeEventListener('touchstart', tap);
        el.removeEventListener('touchmove', drag);
        el.removeEventListener('touchend', release);
      };
    }
  }, [enabled, open, refs, overflowRef, onChangeRef]);
}
