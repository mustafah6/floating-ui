import * as React from 'react';
import {detectOverflow, offset} from '@floating-ui/react-dom';
import type {
  SideObject,
  DetectOverflowOptions,
  Middleware,
  FloatingContext,
  ElementProps,
} from './types';
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
    minItemsVisible?: number;
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
      minItemsVisible = 4,
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
        floating.offsetHeight <
          item.offsetHeight *
            Math.min(minItemsVisible, listRef.current.length) -
            1 ||
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
  const equalHeightRef = React.useRef(false);
  const initialOverflowRef = React.useRef<SideObject | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || !el || overflowRef.current == null) {
        return;
      }

      const dY = e.deltaY;
      const isAtTop = overflowRef.current.top >= -0.5;
      const isAtBottom = overflowRef.current.bottom >= -0.5;
      const remainingScroll = el.scrollHeight - el.clientHeight;
      const sign = dY < 0 ? -1 : 1;
      const method = dY < 0 ? 'max' : 'min';

      // Due to rounding errors, a scrollbar may still appear in certain cases.
      // This ensures it is not scrollable at the maximum.
      if (
        el.scrollHeight === el.clientHeight &&
        !equalHeightRef.current &&
        initialOverflowRef.current &&
        (initialOverflowRef.current.bottom >= -0.5 ||
          initialOverflowRef.current.top >= -0.5)
      ) {
        onChangeRef.current((d) => d + sign);
        equalHeightRef.current = true;
      }

      if (el.scrollHeight <= el.clientHeight) {
        return;
      }

      if ((!isAtTop && dY > 0) || (!isAtBottom && dY < 0)) {
        e.preventDefault();
        flushSync(() => {
          onChangeRef.current(
            (d) => d + Math[method](dY, remainingScroll * sign)
          );
        });
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

        if (overflowRef.current != null) {
          initialOverflowRef.current = {...overflowRef.current};
        }
      });

      return () => {
        prevScrollTopRef.current = null;
        initialOverflowRef.current = null;
        equalHeightRef.current = false;
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
