import { initI18n } from '../i18n/i18n';
import { initTheme } from '../theme';

import { initWatch } from './app';

initTheme();
initWatch(document.getElementById('watch-root') as HTMLElement);
initI18n();
