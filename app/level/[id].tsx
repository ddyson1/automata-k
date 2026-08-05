/**
 * The lab.
 *
 * Layout rules from section 7: the canvas is a fixed card that never resizes or
 * reflows, the dock sits in the thumb zone and never changes contents, and
 * everything contextual floats inside the card.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEVELS, LEVEL_BY_ID } from '../../src/engine/levels';
import { ringLayout } from '../../src/engine/minimize';
import { runSuite, type SuiteResult, run } from '../../src/engine/simulate';
import {
  CANVAS,
  EPSILON,
  type Level,
  type RunResult,
  type StateId,
  type Transition,
} from '../../src/engine/types';
import { validate } from '../../src/engine/validate';
import { useGame } from '../../src/store/game';
import { Canvas, type Selection } from '../../src/ui/components/Canvas';
import { Button, Toggle } from '../../src/ui/components/Controls';
import { FormalPanel } from '../../src/ui/components/FormalPanel';
import { HintSheet, NotesSheet } from '../../src/ui/components/InfoSheets';
import { ResultsSheet } from '../../src/ui/components/ResultsSheet';
import { Sheet } from '../../src/ui/components/Sheet';
import { ConnectPrompt, StateActions } from '../../src/ui/components/StateActions';
import { TracePlayer } from '../../src/ui/components/TracePlayer';
import { TransitionSheet } from '../../src/ui/components/TransitionSheet';
import * as haptics from '../../src/ui/haptics';
import { elevation, RADIUS, SPACE, TAP, TYPE } from '../../src/ui/theme';
import { usePalette } from '../../src/ui/usePalette';

interface Trace {
  input: string;
  result: RunResult;
  index: number;
  playing: boolean;
}

export default function LevelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const level = LEVEL_BY_ID[id ?? ''];
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const machine = useGame((s) => s.drafts[id ?? '']?.machine) ?? {
    states: [],
    transitions: [],
    start: null,
    accepting: [],
  };
  const game = useGame();
  const solvedIds = useGame((s) => s.progress.solved);
  const shownIds = useGame((s) => s.progress.shownSolution);

  const [selection, setSelection] = useState<Selection>(null);
  const [connectArmed, setConnectArmed] = useState(false);
  const [formalOpen, setFormalOpen] = useState(false);
  const [suite, setSuite] = useState<SuiteResult | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [renameFor, setRenameFor] = useState<StateId | null>(null);
  const [renameText, setRenameText] = useState('');
  const [trace, setTrace] = useState<Trace | null>(null);
  const [fitToken, setFitToken] = useState(1);
  const [centreOn, setCentreOn] = useState<{ id: StateId; token: number } | null>(null);
  const [card, setCard] = useState({ width: 320, height: 420 });
  const centreToken = useRef(0);

  const levelId = id ?? '';
  const report = useMemo(
    () => (level ? validate(machine, level) : null),
    [machine, level],
  );

  const highlightIds = useMemo(() => {
    if (selection?.kind !== 'edge') return [];
    const [from, to] = selection.key.split('->');
    return machine.transitions.filter((t) => t.from === from && t.to === to).map((t) => t.id);
  }, [selection, machine.transitions]);

  const connectFrom = connectArmed && selection?.kind === 'state' ? selection.id : null;

  // -------------------------------------------------------------------------

  const onCardLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCard((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, []);

  const defaultTransition = useCallback(
    (from: string, to: string): Omit<Transition, 'id'> => {
      const first = level?.alphabet[0] ?? 'a';
      if (level?.type === 'PDA') {
        return { from, to, read: first, pop: EPSILON, push: EPSILON };
      }
      if (level?.type === 'TM') {
        return { from, to, read: first, write: first, move: 'R' };
      }
      return { from, to, read: first };
    },
    [level],
  );

  const connect = useCallback(
    (from: string, to: string) => {
      if (!level) return;
      game.addTransition(levelId, defaultTransition(from, to));
      haptics.commit();
      setConnectArmed(false);
      setSelection({ kind: 'edge', key: `${from}->${to}` });
      setTransitionOpen(true);
    },
    [game, levelId, defaultTransition, level],
  );

  const addState = useCallback(() => {
    const n = machine.states.length;
    const point = ringLayout(n + 1)[n] ?? { x: CANVAS.width / 2, y: CANVAS.height / 2 };
    const newId = game.addState(levelId, point.x, point.y);
    setSelection({ kind: 'state', id: newId });
  }, [game, levelId, machine.states.length]);

  const runTests = useCallback(() => {
    if (!level) return;
    const result = runSuite(machine, level);
    setSuite(result);
    setResultsOpen(true);
    setTrace(null);
    if (result.solved) {
      game.markSolved(levelId, machine.states.length);
      haptics.pass();
    } else {
      haptics.fail();
    }
  }, [machine, level, game, levelId]);

  const openTrace = useCallback(
    (input: string) => {
      if (!level) return;
      setResultsOpen(false);
      setTrace({ input, result: run(machine, level, input), index: 0, playing: false });
    },
    [machine, level],
  );

  const pickDeltaLine = useCallback(
    (transitionIds: string[], from: string) => {
      centreToken.current += 1;
      if (transitionIds.length > 0) {
        const t = machine.transitions.find((x) => x.id === transitionIds[0]);
        if (t) {
          setSelection({ kind: 'edge', key: `${t.from}->${t.to}` });
          setCentreOn({ id: t.from, token: centreToken.current });
          haptics.tick();
          return;
        }
      }
      setSelection({ kind: 'state', id: from });
      setCentreOn({ id: from, token: centreToken.current });
    },
    [machine.transitions],
  );

  useEffect(() => {
    // A selection that no longer exists would leave stale floating controls.
    if (selection?.kind === 'state' && !machine.states.some((s) => s.id === selection.id)) {
      setSelection(null);
    }
    if (selection?.kind === 'edge') {
      const [from, to] = selection.key.split('->');
      if (!machine.transitions.some((t) => t.from === from && t.to === to)) {
        setSelection(null);
        setTransitionOpen(false);
      }
    }
  }, [machine, selection]);

  if (!level) {
    return (
      <View style={[styles.missing, { backgroundColor: palette.ground }]}>
        <Text style={{ ...TYPE.body, color: palette.ink }}>That level does not exist.</Text>
        <Button label="Back to levels" palette={palette} onPress={() => router.replace('/')} />
      </View>
    );
  }

  const nextLevel = LEVELS.find((l) => l.index === level.index + 1);
  const solvedHere = solvedIds.includes(level.id);
  const shownHere = shownIds.includes(level.id);
  const errorText = report && report.errors.length > 0 ? report.errors[0]?.message : undefined;

  return (
    <View style={[styles.page, { backgroundColor: palette.ground, paddingTop: insets.top }]}>
      <Header
        level={level}
        stateCount={machine.states.length}
        solved={solvedHere}
        onBack={() => router.back()}
        palette={palette}
        onNotes={() => setNotesOpen(true)}
      />

      <View style={styles.cardWrap}>
        <View
          testID="canvas-card"
          onLayout={onCardLayout}
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.hairline },
            elevation(2, palette),
          ]}
        >
          <Canvas
            level={level}
            machine={machine}
            palette={palette}
            width={card.width}
            height={card.height}
            selection={selection}
            onSelect={(s) => {
              setSelection(s);
              if (s?.kind === 'edge') setTransitionOpen(true);
            }}
            connectFrom={connectFrom}
            onConnect={connect}
            onMoveState={(sid, x, y) => game.moveState(levelId, sid, x, y)}
            onRenameState={(sid) => {
              setRenameFor(sid);
              setRenameText(machine.states.find((s) => s.id === sid)?.label ?? '');
            }}
            onBackgroundTap={() => {
              setSelection(null);
              setConnectArmed(false);
            }}
            highlightTransitionIds={highlightIds}
            frame={trace ? (trace.result.frames[trace.index] ?? null) : null}
            fitToken={fitToken}
            centreOn={centreOn}
          />

          <FormalPanel
            level={level}
            machine={machine}
            palette={palette}
            open={formalOpen}
            onToggle={() => setFormalOpen((v) => !v)}
            highlight={highlightIds}
            onPickLine={pickDeltaLine}
            maxHeight={Math.max(160, card.height - 120)}
          />

          {trace ? (
            <TracePlayer
              level={level}
              input={trace.input}
              result={trace.result}
              index={trace.index}
              playing={trace.playing}
              onIndex={(i) => setTrace((t) => (t ? { ...t, index: i } : t))}
              onTogglePlay={() => setTrace((t) => (t ? { ...t, playing: !t.playing } : t))}
              onClose={() => setTrace(null)}
              palette={palette}
            />
          ) : connectArmed ? (
            <ConnectPrompt
              palette={palette}
              label={
                connectFrom
                  ? 'Tap a target state. Tap the same state for a self loop.'
                  : 'Tap the state the arrow leaves from.'
              }
            />
          ) : selection?.kind === 'state' ? (
            <StateActions
              palette={palette}
              machine={machine}
              id={selection.id}
              onSetStart={() => game.setStart(levelId, selection.id)}
              onToggleAccepting={() => game.toggleAccepting(levelId, selection.id)}
              onRename={() => {
                setRenameFor(selection.id);
                setRenameText(machine.states.find((s) => s.id === selection.id)?.label ?? '');
              }}
              onDelete={() => {
                game.deleteState(levelId, selection.id);
                setSelection(null);
              }}
            />
          ) : null}
        </View>
      </View>

      {errorText ? (
        <View style={[styles.error, { backgroundColor: palette.failTint }]}>
          <Text style={{ ...TYPE.small, color: palette.fail }} accessibilityLiveRegion="polite">
            {errorText}
          </Text>
        </View>
      ) : null}

      <View
        testID="dock"
        style={[
          styles.dock,
          {
            backgroundColor: palette.surface,
            borderColor: palette.hairline,
            paddingBottom: Math.max(insets.bottom, SPACE.md),
          },
          elevation(3, palette),
        ]}
      >
        <View style={styles.dockRow}>
          <Button label="Add state" palette={palette} compact grow onPress={addState} />
          <Toggle
            label="Connect"
            palette={palette}
            on={connectArmed}
            testID="connect-toggle"
            onPress={() => setConnectArmed((v) => !v)}
          />
          <Button
            label="Tidy"
            palette={palette}
            compact
            grow
            disabled={machine.states.length === 0}
            onPress={() => game.tidy(levelId)}
          />
          <Button
            label="Fit"
            palette={palette}
            compact
            grow
            testID="fit"
            hint="Fits the machine to the card"
            onPress={() => setFitToken((t) => t + 1)}
          />
        </View>
        <View style={styles.dockRow}>
          <Button
            label="Run tests"
            palette={palette}
            tone="accent"
            testID="run-tests"
            style={styles.primary}
            disabled={machine.states.length === 0}
            onPress={runTests}
          />
          <Button
            label="Undo"
            palette={palette}
            compact
            grow
            disabled={!game.canUndo(levelId)}
            onPress={() => game.undo(levelId)}
          />
          <Button
            label="Redo"
            palette={palette}
            compact
            grow
            disabled={!game.canRedo(levelId)}
            onPress={() => game.redo(levelId)}
          />
          <Button label="Hint" palette={palette} compact grow onPress={() => setHintOpen(true)} />
          <Button label="Notes" palette={palette} compact grow onPress={() => setNotesOpen(true)} />
        </View>
      </View>

      <ResultsSheet
        visible={resultsOpen}
        onClose={() => setResultsOpen(false)}
        palette={palette}
        level={level}
        machine={machine}
        suite={suite}
        wasShown={shownHere}
        onTrace={openTrace}
        onNextLevel={
          suite?.solved && nextLevel ? () => router.replace(`/level/${nextLevel.id}`) : null
        }
      />

      <TransitionSheet
        visible={transitionOpen && selection?.kind === 'edge'}
        onClose={() => setTransitionOpen(false)}
        palette={palette}
        level={level}
        machine={machine}
        edgeKey={selection?.kind === 'edge' ? selection.key : null}
        onUpdate={(tid, patch) => game.updateTransition(levelId, tid, patch)}
        onDelete={(tid) => game.deleteTransition(levelId, tid)}
        onAdd={(from, to) => game.addTransition(levelId, defaultTransition(from, to))}
      />

      <HintSheet
        visible={hintOpen}
        onClose={() => setHintOpen(false)}
        palette={palette}
        level={level}
        alreadyShown={shownHere}
        onReveal={() => {
          game.reveal(levelId);
          setHintOpen(false);
          setSelection(null);
          setFitToken((t) => t + 1);
        }}
      />

      <NotesSheet
        visible={notesOpen}
        onClose={() => setNotesOpen(false)}
        palette={palette}
        level={level}
      />

      <Sheet
        visible={renameFor !== null}
        onClose={() => setRenameFor(null)}
        palette={palette}
        title="Rename state"
        subtitle="Up to six characters."
      >
        <TextInput
          value={renameText}
          onChangeText={setRenameText}
          autoFocus
          maxLength={6}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="State name"
          onSubmitEditing={() => {
            if (renameFor) game.renameState(levelId, renameFor, renameText);
            setRenameFor(null);
          }}
          style={[
            styles.input,
            { borderColor: palette.hairline, color: palette.ink, backgroundColor: palette.surfaceSunken },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg }}>
          <Button label="Cancel" palette={palette} grow onPress={() => setRenameFor(null)} />
          <Button
            label="Rename"
            palette={palette}
            tone="accent"
            grow
            onPress={() => {
              if (renameFor) game.renameState(levelId, renameFor, renameText);
              setRenameFor(null);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

function Header({
  level,
  stateCount,
  solved,
  onBack,
  onNotes,
  palette,
}: {
  level: Level;
  stateCount: number;
  solved: boolean;
  onBack: () => void;
  onNotes: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to levels"
        hitSlop={12}
        style={styles.back}
      >
        <Text style={{ ...TYPE.body, color: palette.accent, fontWeight: '600' }}>Levels</Text>
      </Pressable>
      <View style={styles.headerBody}>
        <Text numberOfLines={1} style={{ ...TYPE.title, color: palette.ink }}>
          {level.index}. {level.title}
        </Text>
        <Text numberOfLines={2} style={{ ...TYPE.small, color: palette.muted }}>
          {level.goal}
        </Text>
      </View>
      <Pressable
        onPress={onNotes}
        accessibilityRole="button"
        accessibilityLabel="Level notes"
        hitSlop={12}
        style={styles.meta}
      >
        <Text style={{ ...TYPE.monoSmall, color: solved ? palette.pass : palette.muted }}>
          {stateCount}/{level.par}
        </Text>
        <Text style={{ ...TYPE.monoSmall, color: palette.muted }}>{level.type}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    minHeight: TAP,
  },
  back: {
    minHeight: TAP,
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  headerBody: {
    flex: 1,
  },
  meta: {
    alignItems: 'flex-end',
    minHeight: TAP,
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  cardWrap: {
    flex: 1,
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    flex: 1,
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  error: {
    marginHorizontal: SPACE.lg,
    marginBottom: SPACE.sm,
    padding: SPACE.sm,
    borderRadius: RADIUS.chip,
  },
  dock: {
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.md,
    gap: SPACE.sm,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  dockRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  // Run tests carries twice the weight of the utilities beside it.
  primary: {
    flexGrow: 2.2,
    flexBasis: 0,
    paddingHorizontal: SPACE.sm,
  },
  input: {
    minHeight: TAP,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    fontSize: 16,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.lg,
  },
});
