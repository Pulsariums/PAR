/** Phone layout: one shelf at a time behind a tab bar (arrow keys, Home / End). On desktop CSS shows all three and hides the bar. */
export const initShelfTabs = (root: HTMLElement): ((name: string) => void) => {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.st-tabs [role=tab]')];
  const select = (name: string, focus = false): void => {
    for (const tab of tabs) {
      const on = tab.dataset.shelf === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      root.querySelector(`#stShelf${tab.dataset.shelf}`)!.classList.toggle('on', on);
      if (on && focus) tab.focus();
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab.dataset.shelf!));
    tab.addEventListener('keydown', (e) => {
      const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (to < 0) return;
      e.preventDefault();
      select(tabs[(to + tabs.length) % tabs.length]!.dataset.shelf!, true);
    });
  });
  return select;
};
