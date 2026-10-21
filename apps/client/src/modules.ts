import { moduleOn, type ModuleKey } from '@spotter/core';
import { tenant } from './env';

/** Whether the trainer has this module switched on (W-1). Entry points check this before rendering. */
export const isOn = (m: ModuleKey): boolean => moduleOn(tenant, m);
