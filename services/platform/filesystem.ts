import { PlatformInfo } from '@lib/platform';
import * as Native from './filesystem.native';
import * as Web from './filesystem.web';

const impl = PlatformInfo.isWeb ? Web : Native;

export const getDocumentDir = impl.getDocumentDir;
export const readFile = impl.readFile;
export const writeFile = impl.writeFile;
export const deleteFile = impl.deleteFile;
export const fileExists = impl.fileExists;
export const downloadFile = impl.downloadFile;
export const ensureDir = impl.ensureDir;
