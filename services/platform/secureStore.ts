import { PlatformInfo } from '@lib/platform';
import * as Native from './secureStore.native';
import * as Web from './secureStore.web';

const impl = PlatformInfo.isWeb ? Web : Native;

export const getItemAsync = impl.getItemAsync;
export const setItemAsync = impl.setItemAsync;
export const deleteItemAsync = impl.deleteItemAsync;
