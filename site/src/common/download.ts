/** Saves a Blob through a temporary link (the object URL is released after 5 s). */
export const download = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
};
