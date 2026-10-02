// Scene list and the lyric layout table gathered from the scenes.
import { Opening } from './s01_opening.js';
import { Shop } from './s02_shop.js';
import { World } from './s03_world.js';
import { Memory } from './s04_memory.js';
import { Bloom } from './s05_bloom.js';
import { Storm } from './s06_storm.js';
import { Echo } from './s07_echo.js';
import { Mosaic } from './s08_mosaic.js';
import { Finale } from './s09_finale.js';

export const SCENES = [Opening, Shop, World, Memory, Bloom, Storm, Echo, Mosaic, Finale];
export const LYRIC_LAYOUT = Object.assign({}, ...SCENES.map((S) => (S.lyrics ? S.lyrics() : {})));
export const EXTRA_TEXTS = ['世界上唯一的花', 'Only one', 'Only One', '花店', 'FLOWERS', '瓣 · 雏菊型波斯菊型罂粟型山茶型星形向日葵型银莲型大丽型莲型樱型', 'No.0123456789#ABCDEF', '明 天', '小时候', '0123456789', 'No.', '你我他', '《世界上唯一的花》中文版演唱原曲作词·作曲槇原敬之中文填词林明阳MG动画每一帧都由代码绘制本片出现的朵花各由一个种子数生成，没有两朵完全相同', 'Sekai ni Hitotsu Dake no Hana Chinese version Canvas 2D BPM fps Every flower in this film grew from its own seed. Only one.'];
