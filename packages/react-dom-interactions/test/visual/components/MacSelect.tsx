import {
  useFloating,
  flip,
  size,
  autoUpdate,
  SideObject,
  useInteractions,
  inner,
  useInnerOffset,
  useClick,
  useListNavigation,
  useDismiss,
  useRole,
  useTypeahead,
  FloatingFocusManager,
  FloatingOverlay,
} from '@floating-ui/react-dom-interactions';
import {useLayoutEffect, useRef, useState} from 'react';

export function Main() {
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const listContentRef = useRef<Array<string | null>>([]);
  const overflowRef = useRef<null | SideObject>(null);
  const allowSelectRef = useRef(false);
  const selectTimeoutRef = useRef<any>();

  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(49);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const [offset, setOffset] = useState(0);
  const [controlledScrolling, setControlledScrolling] = useState(false);

  const {x, y, reference, floating, strategy, context} = useFloating({
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    strategy: 'fixed',
    middleware: fallback
      ? [
          flip({padding: 10}),
          size({
            apply({elements, availableHeight}) {
              Object.assign(elements.floating.style, {
                maxHeight: `${availableHeight}px`,
              });
            },
            padding: 10,
          }),
        ]
      : [
          inner({
            listRef,
            overflowRef,
            index: selectedIndex,
            offset,
            onFallbackChange: setFallback,
            padding: 10,
          }),
        ],
  });

  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    useClick(context, {pointerDown: true}),
    useDismiss(context),
    useRole(context, {role: 'listbox'}),
    useInnerOffset(context, {
      onChange: setOffset,
      overflowRef,
      fallback,
    }),
    useListNavigation(context, {
      listRef,
      activeIndex,
      selectedIndex,
      loop: true,
      onNavigate: setActiveIndex,
    }),
    useTypeahead(context, {
      listRef: listContentRef,
      activeIndex,
      onMatch: open ? setActiveIndex : setSelectedIndex,
    }),
  ]);

  // When in `fallback`/`controlledScrolling` mode, scroll the item into view.
  useLayoutEffect(() => {
    if (open && (fallback || controlledScrolling)) {
      requestAnimationFrame(() => {
        if (activeIndex != null) {
          listRef.current[activeIndex]?.scrollIntoView({block: 'nearest'});
        }
      });
    }
  }, [open, fallback, controlledScrolling, activeIndex]);

  // Resetting the state when the floating element is closed.
  useLayoutEffect(() => {
    if (open) {
      selectTimeoutRef.current = setTimeout(() => {
        allowSelectRef.current = true;
      }, 350);
      return () => {
        clearTimeout(selectTimeoutRef.current);
      };
    } else {
      allowSelectRef.current = false;
      setOffset(0);
      setFallback(false);
    }
  }, [open]);

  return (
    <>
      <h1>Inner</h1>
      <p>
        Anchors to an element inside the floating element. Once the user has
        scrolled the floating element, it will no longer anchor to the item
        inside of it.
      </p>
      <div className="container">
        <div className="scroll" style={{position: 'relative'}}>
          <button
            ref={reference}
            className="reference"
            {...getReferenceProps()}
          >
            List item {selectedIndex + 1}
          </button>
          {open && (
            <FloatingOverlay lockScroll>
              <FloatingFocusManager context={context}>
                <div
                  ref={floating}
                  className="floating"
                  style={{
                    position: strategy,
                    top: y ?? '',
                    left: x ?? '',
                    height: 'auto',
                    width: 'auto',
                    overflow: 'auto',
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(4px)',
                    borderRadius: 4,
                    fontSize: 14,
                  }}
                  {...getFloatingProps({
                    onKeyDown() {
                      setControlledScrolling(true);
                    },
                    onPointerMove() {
                      setControlledScrolling(false);
                    },
                  })}
                >
                  <ul
                    style={{
                      listStyle: 'none',
                      lineHeight: '2',
                      padding: '0',
                      margin: '0',
                      width: 100,
                    }}
                  >
                    {[...Array(50)].map((_, i) => (
                      <li key={i}>
                        <button
                          style={{
                            all: 'unset',
                            borderTop: i !== 0 ? '1px solid gray' : '',
                            padding: '5px 8px',
                            width: '100%',
                            boxSizing: 'border-box',
                            textAlign: 'center',
                            background:
                              activeIndex === i
                                ? 'royalblue'
                                : i === selectedIndex
                                ? 'gray'
                                : 'transparent',
                            color: 'white',
                          }}
                          role="option"
                          tabIndex={-1}
                          aria-selected={activeIndex === i}
                          ref={(node) => {
                            listRef.current[i] = node;
                            listContentRef.current[i] = `List item ${i + 1}`;
                          }}
                          {...getItemProps({
                            onKeyDown() {
                              allowSelectRef.current = true;
                            },
                            onTouchStart() {
                              allowSelectRef.current = true;
                            },
                            onClick() {
                              if (allowSelectRef.current) {
                                setSelectedIndex(i);
                                setOpen(false);
                              }
                            },
                            onMouseUp() {
                              if (
                                allowSelectRef.current ||
                                selectedIndex !== i
                              ) {
                                setSelectedIndex(i);
                                setOpen(false);
                              }

                              // On touch devices, prevent the element from
                              // immediately closing `onClick` by deferring it
                              clearTimeout(selectTimeoutRef.current);
                              selectTimeoutRef.current = setTimeout(() => {
                                allowSelectRef.current = true;
                              });
                            },
                          })}
                        >
                          List item {i + 1}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </FloatingFocusManager>
            </FloatingOverlay>
          )}
        </div>
      </div>
    </>
  );
}
