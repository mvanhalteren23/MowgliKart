import type { ChapterContent } from '../dsl';
import { ashfall } from './ashfall';
import { emberdeep } from './emberdeep';
import { frontier } from './frontier';
import { galecrest } from './galecrest';
import { greyspire } from './greyspire';
import { hollowroot } from './hollowroot';
import { marrowgate } from './marrowgate';
import { mirefast } from './mirefast';
import { rimefold } from './rimefold';
import { saffrane } from './saffrane';

/** Chunk content in story order: frontier (0,0) first, then the nine campaign chunks. */
export const chapters: readonly ChapterContent[] = [frontier, ashfall, galecrest, marrowgate, mirefast, saffrane, hollowroot, rimefold, emberdeep, greyspire];

export const merge = <T>(pick: (c: ChapterContent) => readonly T[]): T[] => chapters.flatMap(pick);
export const mergeRecord = <T>(pick: (c: ChapterContent) => Readonly<Record<string, T>>): Record<string, T> =>
  Object.assign({}, ...chapters.map(pick)) as Record<string, T>;
