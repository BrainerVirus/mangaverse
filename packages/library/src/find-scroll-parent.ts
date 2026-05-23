export function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  if (!element) {
    return null;
  }

  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const { overflow, overflowY } = style;

    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflow === 'auto' ||
      overflow === 'scroll'
    ) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return null;
}
