import { RefObject, useEffect, useState } from "react";

export function useElementRect<T extends Element>(ref: RefObject<T | null>) {
  const [rect, setRect] = useState<DOMRectReadOnly | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setRect(entry.contentRect);
    });
    observer.observe(element);
    setRect(element.getBoundingClientRect());

    return () => observer.disconnect();
  }, [ref]);

  return rect;
}
