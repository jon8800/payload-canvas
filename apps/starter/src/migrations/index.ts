import * as migration_20260314_073436 from './20260314_073436';
import * as migration_20260315_styles_json from './20260315_styles_json';

export const migrations = [
  {
    up: migration_20260314_073436.up,
    down: migration_20260314_073436.down,
    name: '20260314_073436'
  },
  {
    up: migration_20260315_styles_json.up,
    down: migration_20260315_styles_json.down,
    name: '20260315_styles_json',
  },
];
