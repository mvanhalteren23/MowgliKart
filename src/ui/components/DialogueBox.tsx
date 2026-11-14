import { getServices, useGame } from '@/app/store';
import { HERO_IDS, type DialogueChoice, type GameState } from '@/types/contracts';
import { HeroPortrait, SpritePortrait, TapButton } from './common';

/** Choices to present on the last line (empty if not on the last line). Shared with the keyboard handler. */
export function visibleChoices(st: Pick<GameState, 'dialogue' | 'flags' | 'questLog'>): readonly DialogueChoice[] {
  const d = st.dialogue;
  if (!d) return [];
  const { db, core } = getServices();
  const def = db.dialogues[d.dialogueId];
  if (!def || d.lineIndex < def.lines.length - 1) return [];
  return (def.choices ?? []).filter((c) => !c.when || core.quests.evaluate(c.when, st.flags, st.questLog));
}

export function DialogueBox() {
  const dialogue = useGame((s) => s.dialogue);
  const flags = useGame((s) => s.flags);
  const questLog = useGame((s) => s.questLog);
  const advance = useGame((s) => s.advanceDialogue);
  if (!dialogue) return null;
  const { db } = getServices();
  const def = db.dialogues[dialogue.dialogueId];
  const line = def?.lines[dialogue.lineIndex];
  const choices = visibleChoices({ dialogue, flags, questLog });
  const npc = dialogue.npcId ? db.world.npcs.find((n) => n.id === dialogue.npcId) : undefined;
  const heroSpeaker = HERO_IDS.find((h) => db.heroes[h].name === line?.speaker || db.heroes[h].name.split(' ')[0] === line?.speaker);
  const last = def ? dialogue.lineIndex >= def.lines.length - 1 : true;

  return (
    <div className="ew-dialogue-root">
      {choices.length > 0 && (
        <div className="ew-choices">
          {choices.map((c, i) => (
            <TapButton key={c.id} className="ew-choice" data-testid={`dialogue-choice-${c.id}`} onTap={() => advance(c.id)}>
              <span className="ew-choice__n">{i + 1}</span>
              {c.label}
            </TapButton>
          ))}
        </div>
      )}
      <TapButton className="ew-dialogue" data-testid="dialogue-next" disabled={choices.length > 0} onTap={() => advance()} aria-label="Continue">
        <span className="ew-dialogue__face">
          {heroSpeaker ? <HeroPortrait heroId={heroSpeaker} /> : npc && line?.speaker === npc.name ? <SpritePortrait sprite={npc.sprite} /> : null}
        </span>
        <span className="ew-dialogue__body">
          <span className="ew-dialogue__speaker">{line?.speaker ?? ''}</span>
          <span className="ew-dialogue__text" key={`${dialogue.dialogueId}:${dialogue.lineIndex}`}>
            {line?.text ?? '…'}
          </span>
        </span>
        {choices.length === 0 && <span className="ew-dialogue__more">{last ? '■' : '▼'}</span>}
      </TapButton>
    </div>
  );
}
