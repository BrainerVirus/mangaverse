import { PlatformInfo } from '@lib/platform';
import * as Native from './storage.native';
import * as Web from './storage.web';

const impl = PlatformInfo.isWeb ? Web : Native;

export const getItem = impl.getItem;
export const setItem = impl.setItem;
export const removeItem = impl.removeItem;
