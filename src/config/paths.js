import { fileURLToPath } from 'node:url';

// Resolve paths from the project location, independently of the terminal directory.
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const projectURL = new URL('../../', import.meta.url);
