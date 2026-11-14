import type { AssetManifestEntry } from '@/types/contracts';

/**
 * Phase 3 art requests for the external art agent (schema: `AssetManifestEntry`, shared pipeline).
 *
 * Every visual introduced in Phase 3 — mounts, elemental hazards, quick-time prompts and the
 * stamina gauge — is requested here and rendered from `public/assets/generated/` once delivered.
 * Prompts describe Emberwake's own art direction only.
 */

const ROOT = 'public/assets/generated';

/** Shared art direction appended to every prompt. */
const STYLE =
  'Original Emberwake art direction: HD-2D pixel-art hybrid — crisp hand-placed pixel sprites with clean 1px dark outlines, ' +
  'lit by warm lantern-glow and soft volumetric light; warm lantern-lit palette of ember orange, honey gold and dusk teal ' +
  'with deep indigo shadows; gentle bloom on light sources; no text, no logos, no watermark.';

const HUD_STYLE =
  'Original Emberwake HUD style: hand-crafted pixel-art interface piece with brass-and-soot lantern framing, warm ember ' +
  'highlights, teal enamel accents and a soft outer glow, readable at small sizes on a phone in landscape; no text, no logos.';

/** The eight facings in sheet-row order (row = facing, 0 = south, clockwise). */
export const FACINGS = ['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'] as const;
const FACING_WORDS = 'south, south-west, west, north-west, north, north-east, east, south-east';

type Anim = readonly [name: string, frames: number];

/** 8-direction sheet: one row per facing, animations as contiguous column ranges. */
function directionalSheet(o: {
  id: string; folder: string; frame: number; fps: number; anims: readonly Anim[];
  category: NonNullable<AssetManifestEntry['category']>; subject: string;
}): AssetManifestEntry {
  const columns = o.anims.reduce((n, [, c]) => n + c, 0);
  const states: { name: string; row: number; from: number; count: number }[] = [];
  FACINGS.forEach((dir, row) => {
    let from = 0;
    for (const [name, count] of o.anims) {
      states.push({ name: `${name}_${dir}`, row, from, count });
      from += count;
    }
  });
  const animText = o.anims.map(([n, c]) => `${n} (${c} frames)`).join(', ');
  return {
    asset_id: o.id,
    type: 'spritesheet',
    target_path: `${ROOT}/${o.folder}/${o.id}.webp`,
    resolution: { width: columns * o.frame, height: FACINGS.length * o.frame },
    grid: { columns, rows: FACINGS.length, frame_width: o.frame, frame_height: o.frame },
    fps: o.fps,
    loop: true,
    alpha_channel: true,
    prompt_spec:
      `${o.subject} Sprite sheet with 8 rows, one per facing in this order: ${FACING_WORDS}. ` +
      `Columns left to right: ${animText}. Each ${o.frame}x${o.frame} frame centred on the ground contact point, ` +
      `transparent background, consistent scale and lighting across all frames. ${STYLE}`,
    status: 'pending',
    category: o.category,
    animation_states: states,
  };
}

/** Single-row looping or one-shot strip. */
function strip(o: {
  id: string; folder: string; frameW: number; frameH: number; frames: number; fps: number; loop: boolean;
  category: NonNullable<AssetManifestEntry['category']>; subject: string; hud?: boolean;
}): AssetManifestEntry {
  return {
    asset_id: o.id,
    type: 'spritesheet',
    target_path: `${ROOT}/${o.folder}/${o.id}.webp`,
    resolution: { width: o.frames * o.frameW, height: o.frameH },
    grid: { columns: o.frames, rows: 1, frame_width: o.frameW, frame_height: o.frameH },
    fps: o.fps,
    loop: o.loop,
    alpha_channel: true,
    prompt_spec: `${o.subject} ${o.frames} frames of ${o.frameW}x${o.frameH} in a single row, ${o.loop ? 'seamlessly looping' : 'one-shot, ending fully transparent'}, transparent background. ${o.hud ? HUD_STYLE : STYLE}`,
    status: 'pending',
    category: o.category,
  };
}

function icon(id: string, folder: string, size: number, category: NonNullable<AssetManifestEntry['category']>, subject: string): AssetManifestEntry {
  return {
    asset_id: id,
    type: 'icon',
    target_path: `${ROOT}/${folder}/${id}.png`,
    resolution: { width: size, height: size },
    alpha_channel: true,
    prompt_spec: `${subject} Square ${size}x${size} icon on a transparent background, centred with a 4px safe margin, legible at 48px. ${HUD_STYLE}`,
    status: 'pending',
    category,
  };
}

/* ── Asset ids the data / engine / UI reference ────────────────────────── */

export const ASSET = {
  drakeFlight: 'mount_drake_flight_01',
  drakeFlightRiderKael: 'mount_drake_flight_rider_kael_01',
  drakeFlightIcon: 'mount_drake_flight_icon_01',
  strider: 'mount_thornback_strider_01',
  striderRiderKael: 'mount_thornback_strider_rider_kael_01',
  striderRiderTobin: 'mount_thornback_strider_rider_tobin_01',
  striderRiderVesna: 'mount_thornback_strider_rider_vesna_01',
  striderIcon: 'mount_thornback_strider_icon_01',
  staminaFrame: 'hud_stamina_gauge_frame_01',
  staminaFill: 'hud_stamina_gauge_fill_01',
  staminaExhausted: 'hud_stamina_exhausted_pulse_01',
  qteRing: 'qte_timing_ring_01',
  qteGood: 'qte_grade_good_01',
  qtePerfect: 'qte_grade_perfect_01',
  qteMiss: 'qte_grade_miss_01',
  reactionBurst: 'fx_reaction_burst_01',
  hitStopFlash: 'fx_qte_hitstop_flash_01',
} as const;

/** QTE prompt sheets, keyed by input (`QteInput`). */
export const QTE_PROMPT_ASSET = {
  up: 'qte_prompt_up_01',
  down: 'qte_prompt_down_01',
  left: 'qte_prompt_left_01',
  right: 'qte_prompt_right_01',
  tap: 'qte_prompt_tap_01',
} as const;

/** Hazard FX loop + HUD icon ids, keyed by the hazard's short name. */
export const HAZARD_ASSET = {
  waterPuddle: { fx: 'hazard_water_puddle_01', icon: 'hazard_water_puddle_icon_01' },
  steamVent: { fx: 'hazard_steam_vent_01', icon: 'hazard_steam_vent_icon_01' },
  electrifiedWater: { fx: 'hazard_electrified_water_01', icon: 'hazard_electrified_water_icon_01' },
  frozenLake: { fx: 'hazard_frozen_lake_01', icon: 'hazard_frozen_lake_icon_01' },
  smokeCloud: { fx: 'hazard_smoke_cloud_01', icon: 'hazard_smoke_cloud_icon_01' },
  emberField: { fx: 'hazard_ember_field_01', icon: 'hazard_ember_field_icon_01' },
} as const;

/* ── Mounts ────────────────────────────────────────────────────────────── */

const FLIGHT_ANIMS: readonly Anim[] = [['idle', 4], ['move', 6], ['takeoff', 4], ['land', 4]];
const STRIDER_ANIMS: readonly Anim[] = [['idle', 4], ['move', 6], ['run', 6]];

const DRAKE =
  'Kael\'s ember-scaled young drake seen from a three-quarter top-down camera: soot-black scales cracked with glowing ' +
  'orange seams, ash-grey wing membranes lit from beneath, a smouldering crest and a long ember-tipped tail.';
const STRIDER =
  'A thornback strider: a long-legged, saddled frontier beast with a ridge of bramble-like dorsal spines, ' +
  'mossy-brown hide, a short beaked muzzle and woven Hearthstead tack with small brass lantern charms.';

const mountSheets: readonly AssetManifestEntry[] = [
  directionalSheet({
    id: ASSET.drakeFlight, folder: 'mounts', frame: 192, fps: 10, anims: FLIGHT_ANIMS, category: 'mount',
    subject: `${DRAKE} Riderless, hovering idle with slow wingbeats, gliding flight, a takeoff launch and a landing flare.`,
  }),
  directionalSheet({
    id: ASSET.drakeFlightRiderKael, folder: 'mounts', frame: 192, fps: 10, anims: FLIGHT_ANIMS, category: 'mount',
    subject:
      `${DRAKE} Ridden by Kael — a lean young swordsman with a soot-dark coat, ember-orange scarf streaming behind him and ` +
      'a blade across his back — seated at the base of the neck. Same animation set as the riderless drake.',
  }),
  directionalSheet({
    id: ASSET.strider, folder: 'mounts', frame: 128, fps: 10, anims: STRIDER_ANIMS, category: 'mount',
    subject: `${STRIDER} Riderless, with an idle head-bob, a striding walk and a bounding gallop.`,
  }),
  ...([
    ['kael', ASSET.striderRiderKael, 'Kael, a lean young swordsman in a soot-dark coat with an ember-orange scarf'],
    ['tobin', ASSET.striderRiderTobin, 'Tobin, a weathered frontier warden in a green hooded cloak with a longbow across his back'],
    ['vesna', ASSET.striderRiderVesna, 'Vesna, an arena duelist in crimson wraps with a long glaive held upright'],
  ] as const).map(([, id, rider]) =>
    directionalSheet({
      id, folder: 'mounts', frame: 128, fps: 10, anims: STRIDER_ANIMS, category: 'mount',
      subject: `${STRIDER} Ridden by ${rider}, rider seated in the saddle and swaying with the gait. Same animation set as the riderless strider.`,
    }),
  ),
];

const mountIcons: readonly AssetManifestEntry[] = [
  icon(ASSET.drakeFlightIcon, 'hud', 128, 'hud', 'Mount button icon: a soot-black drake head in profile with glowing ember seams and a spread wing behind it.'),
  icon(ASSET.striderIcon, 'hud', 128, 'hud', 'Mount button icon: a thornback strider head in profile with bramble spines and a brass lantern charm on the bridle.'),
];

/* ── Hazards ───────────────────────────────────────────────────────────── */

const HAZARD_ART: Readonly<Record<keyof typeof HAZARD_ASSET, { fx: string; icon: string }>> = {
  waterPuddle: {
    fx: 'Battlefield ground hazard: a broad shallow puddle of rainwater spreading across packed earth, rippling rings and glints of lantern light.',
    icon: 'Hazard icon: a single teal water droplet over three ripple rings.',
  },
  steamVent: {
    fx: 'Battlefield ground hazard: scalding white steam hissing up from cracked wet ground in rolling plumes, warm orange underglow.',
    icon: 'Hazard icon: three curling steam wisps rising from a cracked stone.',
  },
  electrifiedWater: {
    fx: 'Battlefield ground hazard: a shallow puddle crackling with jagged violet-white lightning arcs that skitter across the surface.',
    icon: 'Hazard icon: a teal droplet split by a violet-white lightning bolt.',
  },
  frozenLake: {
    fx: 'Battlefield ground hazard: a sheet of pale blue ice spreading over the ground, frost creeping at the edges, occasional glints and hairline cracks.',
    icon: 'Hazard icon: a pale blue hexagonal ice crystal over a cracked ice sheet.',
  },
  smokeCloud: {
    fx: 'Battlefield hazard: a dense, low-hanging cloud of grey-brown smoke with faint ember sparks drifting inside, thick enough to hide silhouettes.',
    icon: 'Hazard icon: a heavy grey smoke cloud with two faint ember sparks.',
  },
  emberField: {
    fx: 'Battlefield ground hazard: scattered glowing embers and small licking flames across scorched ground, heat shimmer above.',
    icon: 'Hazard icon: three glowing embers on a scorched black patch.',
  },
};

const hazardAssets: readonly AssetManifestEntry[] = (Object.keys(HAZARD_ASSET) as (keyof typeof HAZARD_ASSET)[]).flatMap((k) => [
  strip({
    id: HAZARD_ASSET[k].fx, folder: 'fx', frameW: 256, frameH: 128, frames: 8, fps: 10, loop: true, category: 'hazard',
    subject: `${HAZARD_ART[k].fx} Viewed from a three-quarter top-down battle camera, wide and flat to sit under combatants.`,
  }),
  icon(HAZARD_ASSET[k].icon, 'hud', 64, 'hazard', HAZARD_ART[k].icon),
]);

/* ── Quick-time events ─────────────────────────────────────────────────── */

const QTE_STATES = [
  { name: 'idle', row: 0, from: 0, count: 4 },
  { name: 'hit', row: 1, from: 0, count: 6 },
  { name: 'perfect', row: 2, from: 0, count: 6 },
] as const;

function qtePrompt(id: string, glyph: string): AssetManifestEntry {
  const frame = 128;
  return {
    asset_id: id,
    type: 'spritesheet',
    target_path: `${ROOT}/qte/${id}.webp`,
    resolution: { width: 6 * frame, height: 3 * frame },
    grid: { columns: 6, rows: 3, frame_width: frame, frame_height: frame },
    fps: 16,
    loop: false,
    alpha_channel: true,
    prompt_spec:
      `Quick-time prompt: ${glyph} inside a round brass-rimmed lantern badge. Row 1 idle: 4 frames of a gentle ember pulse (remaining columns empty). ` +
      'Row 2 hit: 6 frames, the badge flashes honey-gold and pops outward. Row 3 perfect: 6 frames, a brighter white-gold burst ' +
      `with a ring of sparks. Each frame ${frame}x${frame}, transparent background. ${HUD_STYLE}`,
    status: 'pending',
    category: 'qte',
    animation_states: QTE_STATES,
  };
}

const qteAssets: readonly AssetManifestEntry[] = [
  qtePrompt(QTE_PROMPT_ASSET.up, 'a bold upward-pointing chevron arrow (swipe up)'),
  qtePrompt(QTE_PROMPT_ASSET.down, 'a bold downward-pointing chevron arrow (swipe down)'),
  qtePrompt(QTE_PROMPT_ASSET.left, 'a bold left-pointing chevron arrow (swipe left)'),
  qtePrompt(QTE_PROMPT_ASSET.right, 'a bold right-pointing chevron arrow (swipe right)'),
  qtePrompt(QTE_PROMPT_ASSET.tap, 'a fingertip-sized glowing dot with a concentric ring (tap)'),
  strip({
    id: ASSET.qteRing, folder: 'qte', frameW: 256, frameH: 256, frames: 12, fps: 12, loop: false, category: 'qte', hud: true,
    subject: 'Quick-time timing ring: a thin ember-gold ring that shrinks inward around a prompt badge, its inner third tinted brighter to mark the perfect zone.',
  }),
  strip({
    id: ASSET.qteGood, folder: 'qte', frameW: 384, frameH: 128, frames: 8, fps: 16, loop: false, category: 'qte', hud: true,
    subject: 'Grade banner "good" shown as a symbol, not lettering: a short brass ribbon unfurling with a single amber star.',
  }),
  strip({
    id: ASSET.qtePerfect, folder: 'qte', frameW: 384, frameH: 128, frames: 8, fps: 16, loop: false, category: 'qte', hud: true,
    subject: 'Grade banner "perfect" shown as a symbol, not lettering: a wide gold ribbon unfurling with three blazing stars and drifting sparks.',
  }),
  strip({
    id: ASSET.qteMiss, folder: 'qte', frameW: 384, frameH: 128, frames: 8, fps: 16, loop: false, category: 'qte', hud: true,
    subject: 'Grade banner "miss" shown as a symbol, not lettering: a sooty grey ribbon that droops, with a snuffed lantern wick trailing smoke.',
  }),
];

/* ── Stamina HUD and combat FX ─────────────────────────────────────────── */

const hudAssets: readonly AssetManifestEntry[] = [
  {
    asset_id: ASSET.staminaFrame, type: 'sprite', target_path: `${ROOT}/hud/${ASSET.staminaFrame}.png`,
    resolution: { width: 256, height: 64 }, alpha_channel: true, status: 'pending', category: 'hud',
    prompt_spec: `Stamina gauge frame: a horizontal brass-and-soot capsule with a small wing emblem on the left cap and an empty dark interior channel for the fill. ${HUD_STYLE}`,
  },
  {
    asset_id: ASSET.staminaFill, type: 'sprite', target_path: `${ROOT}/hud/${ASSET.staminaFill}.png`,
    resolution: { width: 256, height: 64 }, alpha_channel: true, status: 'pending', category: 'hud',
    prompt_spec: `Stamina gauge fill: a horizontal bar of warm green-gold light with a subtle grain texture, sized to sit inside the gauge frame channel and be cropped from the right. ${HUD_STYLE}`,
  },
  strip({
    id: ASSET.staminaExhausted, folder: 'hud', frameW: 256, frameH: 64, frames: 6, fps: 8, loop: true, category: 'hud', hud: true,
    subject: 'Exhausted overlay for the stamina gauge: a slow ember-red pulse glowing around the capsule outline.',
  }),
  strip({
    id: ASSET.reactionBurst, folder: 'fx', frameW: 192, frameH: 192, frames: 10, fps: 20, loop: false, category: 'fx',
    subject: 'Elemental reaction burst: a radial flash where two elements collide — a ring of mixed ember, teal and violet light with flying motes.',
  }),
  strip({
    id: ASSET.hitStopFlash, folder: 'fx', frameW: 192, frameH: 192, frames: 6, fps: 24, loop: false, category: 'fx',
    subject: 'Impact flash for a perfect quick-time strike: a sharp white-gold star-shaped impact with speed lines radiating outward.',
  }),
];

export const phase3Assets: readonly AssetManifestEntry[] = [
  ...mountSheets,
  ...mountIcons,
  ...hazardAssets,
  ...qteAssets,
  ...hudAssets,
];
