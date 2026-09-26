import { type RefObject, useEffect } from 'react';

export function useReplay(element: RefObject<HTMLElement | null>, trigger: string): void {
  useEffect(() => {
    const node = element.current;
    if (!node || !trigger) return;
    node.classList.remove('enter');
    void node.offsetWidth;
    node.classList.add('enter');
  }, [element, trigger]);
}
