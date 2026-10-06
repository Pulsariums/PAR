/** Accessible tab list (arrow keys, Home/End). Returns a function that selects a tab by id. */
export const initTabs = (root: HTMLElement): ((id: string) => void) => {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const select = (id: string, focus = false) => {
    for (const tab of tabs) {
      const on = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      root.querySelector<HTMLElement>(`#pn-${tab.dataset.tab}`)!.hidden = !on;
      if (on && focus) tab.focus();
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab.dataset.tab!));
    tab.addEventListener('keydown', (e) => {
      const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (to < 0) return;
      e.preventDefault();
      select(tabs[(to + tabs.length) % tabs.length].dataset.tab!, true);
    });
  });
  select('source');
  return select;
};
