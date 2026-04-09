import { Direction, IntervalMode, SortKey, SortOptions } from './types';

export const DIRECTIONS: Direction[] = ['horizontal', 'vertical', 'both'];
export const SORT_KEYS: SortKey[] = [
  'brightness',
  'hue',
  'saturation',
  'lightness',
  'red',
  'green',
  'blue',
];
export const INTERVAL_MODES: IntervalMode[] = ['threshold', 'full', 'random'];

export const DEFAULTS: SortOptions = {
  direction: 'horizontal',
  key: 'brightness',
  mode: 'threshold',
  lo: 0.25,
  hi: 0.8,
  reverse: false,
  maxLen: 200,
  exclude: null,
  excludeInvert: false,
};
