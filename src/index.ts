#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import { readImage, writeImage } from './image';
import { sortRows, sortColumns } from './sort';
import { Direction, SortKey, IntervalMode, SortOptions } from './types';
import type { Rect } from './types';
import { DIRECTIONS, SORT_KEYS, INTERVAL_MODES, DEFAULTS } from './constants';

const DIR_ABBREV: Record<Direction, string> = { horizontal: 'h', vertical: 'v', both: 'b' };
const KEY_ABBREV: Record<SortKey, string> = {
  brightness: 'bri',
  hue: 'hue',
  saturation: 'sat',
  lightness: 'lit',
  red: 'red',
  green: 'grn',
  blue: 'blu',
};
const MODE_ABBREV: Record<IntervalMode, string> = { full: 'full', threshold: 'thr', random: 'rnd' };

function parseExclude(value: string): Rect {
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    console.error('--exclude must be four comma-separated integers: x1,y1,x2,y2');
    process.exit(1);
  }
  const [x1, y1, x2, y2] = parts;
  if (x1 > x2 || y1 > y2) {
    console.error('--exclude: x1 must be <= x2 and y1 must be <= y2');
    process.exit(1);
  }
  return { x1, y1, x2, y2 };
}

function formatModeDetail(opts: SortOptions): string {
  if (opts.mode === 'threshold') return ` [${opts.lo}–${opts.hi}]`;
  if (opts.mode === 'random') return ` (max ${opts.maxLen}px)`;
  return '';
}

function defaultOutputPath(input: string, opts: SortOptions): string {
  const ext = path.extname(input);
  const base = path.basename(input, ext);

  const parts = [DIR_ABBREV[opts.direction], KEY_ABBREV[opts.key], MODE_ABBREV[opts.mode]];

  if (opts.mode === 'threshold') parts.push(`${opts.lo}-${opts.hi}`);
  if (opts.mode === 'random') parts.push(`${opts.maxLen}`);
  if (opts.reverse) parts.push('r');
  if (opts.exclude) parts.push(opts.excludeInvert ? 'inv' : 'excl');

  return path.join(path.dirname(input), `${base}_${parts.join('_')}${ext}`);
}

program
  .name('pixel-sort')
  .description('Configurable pixel sorting glitch art tool')
  .argument('<input>', 'Input image path')
  .option('-o, --output <path>', 'Output path (default: <name>_<opts>.<ext>)')
  .option('-d, --direction <dir>', `Sort direction: ${DIRECTIONS.join(' | ')}`, DEFAULTS.direction)
  .option('-k, --key <key>', `Sort key: ${SORT_KEYS.join(' | ')}`, DEFAULTS.key)
  .option('-m, --mode <mode>', `Interval mode: ${INTERVAL_MODES.join(' | ')}`, DEFAULTS.mode)
  .option('--lo <n>', 'Lower brightness threshold 0–1 (threshold mode)', parseFloat, DEFAULTS.lo)
  .option('--hi <n>', 'Upper brightness threshold 0–1 (threshold mode)', parseFloat, DEFAULTS.hi)
  .option('-r, --reverse', 'Sort in descending order', DEFAULTS.reverse)
  .option(
    '--max-len <n>',
    'Max interval length for random mode (pixels)',
    parseInt,
    DEFAULTS.maxLen,
  )
  .option('--exclude <x1,y1,x2,y2>', 'Exclude a rectangle from sorting (pixel coordinates)')
  .option('--invert-mask', 'Sort ONLY inside the --exclude rectangle instead of outside it')
  .action(async (input: string, opts) => {
    if (!DIRECTIONS.includes(opts.direction)) {
      console.error(`Invalid direction. Choose: ${DIRECTIONS.join(', ')}`);
      process.exit(1);
    }
    if (!SORT_KEYS.includes(opts.key)) {
      console.error(`Invalid key. Choose: ${SORT_KEYS.join(', ')}`);
      process.exit(1);
    }
    if (!INTERVAL_MODES.includes(opts.mode)) {
      console.error(`Invalid mode. Choose: ${INTERVAL_MODES.join(', ')}`);
      process.exit(1);
    }

    const sortOpts: SortOptions = {
      direction: opts.direction as Direction,
      key: opts.key as SortKey,
      mode: opts.mode as IntervalMode,
      lo: opts.lo,
      hi: opts.hi,
      reverse: opts.reverse,
      maxLen: opts.maxLen,
      exclude: opts.exclude ? parseExclude(opts.exclude as string) : null,
      excludeInvert: !!opts.invertMask,
    };

    const output = opts.output ?? defaultOutputPath(input, sortOpts);

    let image;
    try {
      image = await readImage(input);
    } catch (e) {
      console.error(`Error reading image: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }

    const { data, width, height } = image;

    console.log(`${path.basename(input)}  ${width}x${height}`);
    const excludeStr = sortOpts.exclude
      ? ` / ${sortOpts.excludeInvert ? 'invert-mask' : 'exclude'} [${sortOpts.exclude.x1},${sortOpts.exclude.y1},${sortOpts.exclude.x2},${sortOpts.exclude.y2}]`
      : '';
    console.log(
      `${opts.direction} / ${opts.key} / ${opts.mode}${formatModeDetail(sortOpts)}${opts.reverse ? ' / reversed' : ''}${excludeStr}`,
    );

    if (opts.direction === 'horizontal' || opts.direction === 'both') {
      process.stdout.write('Sorting rows... ');
      sortRows(data, width, height, sortOpts);
      console.log('done');
    }
    if (opts.direction === 'vertical' || opts.direction === 'both') {
      process.stdout.write('Sorting columns... ');
      sortColumns(data, width, height, sortOpts);
      console.log('done');
    }

    process.stdout.write(`Writing ${path.basename(output)}... `);
    await writeImage(output, image);
    console.log('done');
  });

program.parse();
