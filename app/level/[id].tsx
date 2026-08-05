/**
 * The lab, Ledger layout.
 *
 * Two permanent panes split by a handle you can drag: the diagram above, the
 * transition function below. Neither is a preview of the other. Grading is
 * continuous, so there is no Run button and no results sheet; the suite strip
 * recolours as you edit and tapping a test plays its trace between the panes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEVELS, LEVEL_BY_ID } from '../../src/engine/levels';
import { ringLayout } from '../../src/engine/minimize';
import { run, runSuite, shortestCounterexample, type SuiteResult } from '../../src/engine/simulate';
import {
  CANVAS,
  EPSILON,
  type RunResult,
  type StateId,
  type Transition,
} from '../../src/engine/types';
import { validate } from '../../src/engine/validate';
import { useGame } from '../../src/store/game';
import { Canvas, type Selection } from '../../src/ui/components/Canvas';
import { Ledger } from '../../src/ui/components/Ledger';
import { LevelSheet, type LevelTab } from '../../src/ui/components/LevelSheet';
import { Sheet } from '../../src/ui/components/Sheet';
import { ConnectPrompt, StateActions } from '../../src/ui/components/StateActions';
import { SuiteStrip } from '../../src/ui/components/SuiteStrip';
import { TracePlayer } from '../../src/ui/components/TracePlayer';
import * as haptics from '../../src/ui/haptics';
import { GRADE_DEBOUNCE_MS, RADIUS, SPACE, TAP, TYPE } from '../../src/ui/theme';
import { usePalette } from '../../src/ui/usePalette';

interface Trace {
  input: string;
  result: RunResult;
  index: number;
  playing: boolean;
}

const MIN_DIAGRAM = 180;
const MIN_LEDGER = 190;

export default function LevelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const level = LEVEL_BY_ID[id ?? ''];
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const machine = useGame((s) => s.drafts[id ?? '']?.machine) ?? {
    states: [],
    transitions: [],
    start: null,
    accepting: [],
  };
  const game = useGame();
  const shownIds = useGame((s) => s.progress.shownSolution);

  const [selection, setSelection] = useState<Selection>(null);
  const [connectArmed, setConnectArmed] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [suite, setSuite] = useState<SuiteResult | null>(null);
  const [sheetTab, setSheetTab] = useState<LevelTab | null>(null);
  const [renameFor, setRenameFor] = useState<StateId | null>(null);
  const [renameText, setRenameText] = useState('');
  const [trace, setTrace] = useState<Trace | null>(null);
  const [fitToken, setFitToken] = useState(1);
  const [centreOn, setCentreOn] = useState<{ id: StateId; token: number } | null>(null);
  const [pane, setPane] = useState({ width: 340, height: 300 });
  const centreToken = useRef(0);

  const levelId = id ?? '';

  // The divider drags on the UI thread and commits one height on release.
  const diagramH = useSharedValue(320);
  const [committedH, setCommittedH] = useState(320);
  const sizedFor = useRef(0);
  useEffect(() => {
    if (sizedFor.current === window.height) return;
    sizedFor.current = window.height;
    const initial = Math.max(
      MIN_DIAGRAM,
      Math.round((window.height - insets.top - insets.bottom) * 0.4),
    );
    diagramH.value = initial;
    setCommittedH(initial);
  }, [window.height, insets.top, insets.bottom, diagramH]);

  const report = useMemo(() => (level ? validate(machine, level) : null), [machine, level]);
  const wellFormed = report?.ok === true && machine.states.length > 0;

  // Continuous grading, debounced so a half-drawn machine is not shouted at.
  useEffect(() => {
    if (!level) return;
    if (!wellFormed) {
      setSuite(null);
      return;
    }
    const t = setTimeout(() => setSuite(runSuite(machine, level)), GRADE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [machine, level, wellFormed]);

  const solvedNow = suite?.solved === true;
  const wasSolved = useRef(false);
  useEffect(() => {
    if (!level) return;
    if (solvedNow && !wasSolved.current) {
      wasSolved.current = true;
      game.markSolved(levelId, machine.states.length);
      haptics.pass();
    }
    if (!solvedNow) wasSolved.current = false;
  }, [solvedNow, level, game, levelId, machine.states.length]);

  const counter = useMemo(() => {
    if (!level || !suite || suite.solved) return null;
    return shortestCounterexample(machine, level, 7);
  }, [suite, machine, level]);

  const highlightIds = useMemo(() => {
    if (selection?.kind !== 'edge') return [];
    const [from, to] = selection.key.split('->');
    return machine.transitions.filter((t) => t.from === from && t.to === to).map((t) => t.id);
  }, [selection, machine.transitions]);

  const connectFrom = connectArmed && selection?.kind === 'state' ? selection.id : null;

  // -------------------------------------------------------------------------

  const onPaneLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPane((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, []);

  const defaultTransition = useCallback(
    (from: string, to: string, read?: string): Omit<Transition, 'id'> => {
      const symbol = read ?? level?.alphabet[0] ?? 'a';
      if (level?.type === 'PDA') return { from, to, read: symbol, pop: EPSILON, push: EPSILON };
      if (level?.type === 'TM') return { from, to, read: symbol, write: symbol, move: 'R' };
      return { from, to, read: symbol };
    },
    [level],
  );

  const connect = useCallback(
    (from: string, to: string) => {
      if (!level) return;
      const tid = game.addTransition(levelId, defaultTransition(from, to));
      haptics.commit();
      setConnectArmed(false);
      setSelection({ kind: 'edge', key: `${from}->${to}` });
      setOpenRow(tid);
    },
    [game, levelId, defaultTransition, level],
  );

  const addState = useCallback(() => {
    const n = machine.states.length;
    const point = ringLayout(n + 1)[n] ?? { x: CANVAS.width / 2, y: CANVAS.height / 2 };
    const newId = game.addState(levelId, point.x, point.y);
    setSelection({ kind: 'state', id: newId });
  }, [game, levelId, machine.states.length]);

  const openTrace = useCallback(
    (input: string) => {
      if (!level) return;
      haptics.tick();
      setTrace({ input, result: run(machine, level, input), index: 0, playing: false });
    },
    [machine, level],
  );

  const focusTransition = useCallback((t: Transition) => {
    centreToken.current += 1;
    setSelection({ kind: 'edge', key: `${t.from}->${t.to}` });
    setCentreOn({ id: t.from, token: centreToken.current });
  }, []);

  const paneHeight = pane.height;
  const divider = Gesture.Pan()
    .onChange((e) => {
      const next = diagramH.value + e.changeY;
      const max = Math.max(MIN_DIAGRAM, paneHeight + diagramH.value - MIN_LEDGER);
      diagramH.value = Math.min(max, Math.max(MIN_DIAGRAM, next));
    })
    .onEnd(() => {
      runOnJS(setCommittedH)(diagramH.value);
    });

  const diagramStyle = useAnimatedStyle(() => ({ height: diagramH.value }));

  useEffect(() => {
    if (selection?.kind === 'state' && !machine.states.some((s) => s.id === selection.id)) {
      setSelection(null);
    }
    if (selection?.kind === 'edge') {
      const [from, to] = selection.key.split('->');
      if (!machine.transitions.some((t) => t.from === from && t.to === to)) setSelection(null);
    }
    if (
      openRow &&
      !openRow.startsWith('gap:') &&
      !machine.transitions.some((t) => t.id === openRow)
    ) {
      setOpenRow(null);
    }
  }, [machine, selection, openRow]);

  if (!level) {
    return (
      <View style={[styles.missing, { backgroundColor: palette.ground }]}>
        <Text style={{ ...TYPE.body, color: palette.ink }}>That level does not exist.</Text>
        <Pressable onPress={() => router.replace('/')} accessibilityRole="button">
          <Text style={{ ...TYPE.bodyStrong, color: palette.accentInk }}>Back to levels</Text>
        </Pressable>
      </View>
    );
  }

  const nextLevel = LEVELS.find((l) => l.index === level.index + 1);
  const shownHere = shownIds.includes(level.id);
  const errorText = report && report.errors.length > 0 ? report.errors[0]?.message : undefined;

  return (
    <View style={[styles.page, { backgroundColor: palette.ground, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: palette.hairline }]}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to levels"
            hitSlop={12}
            style={styles.back}
          >
            <Text style={{ ...TYPE.small, color: palette.accentInk, fontWeight: '600' }}>
              ‹ Levels
            </Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Text style={{ ...TYPE.label, color: palette.muted }}>
            {`${machine.states.length}/${level.par} · ${level.type}`}
          </Text>
        </View>
        <Text style={{ ...TYPE.display, color: palette.ink }} numberOfLines={1}>
          {level.title}
        </Text>
        <Text style={{ ...TYPE.small, color: palette.muted }} numberOfLines={2}>
          {level.goal}
        </Text>
      </View>

      <Animated.View style={[styles.diagram, diagramStyle]}>
        <View style={styles.diagramInner} onLayout={onPaneLayout} testID="canvas-card">
          <Canvas
            level={level}
            machine={machine}
            palette={palette}
            width={pane.width}
            height={committedH}
            selection={selection}
            onSelect={(s) => {
              setSelection(s);
              if (s?.kind === 'edge') {
                const first = machine.transitions.find((t) => `${t.from}->${t.to}` === s.key);
                if (first) setOpenRow(first.id);
              }
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

          <Pressable
            testID="fit"
            onPress={() => setFitToken((t) => t + 1)}
            accessibilityRole="button"
            accessibilityLabel="Fit the machine to the pane"
            style={[styles.fit, { borderColor: palette.hairline, backgroundColor: palette.ground }]}
          >
            <Text style={{ ...TYPE.label, color: palette.muted }}>FIT</Text>
          </Pressable>

          {connectArmed ? (
            <ConnectPrompt
              palette={palette}
              label={
                connectFrom
                  ? 'Tap a target state, or the same one for a self loop'
                  : 'Tap the state the arrow leaves from'
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
      </Animated.View>

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
      ) : null}

      <GestureDetector gesture={divider}>
        <View
          testID="divider"
          accessibilityRole="adjustable"
          accessibilityLabel="Resize the diagram"
          style={[
            styles.grip,
            { borderTopColor: palette.rule, borderBottomColor: palette.hairline },
          ]}
        >
          <View style={[styles.gripBar, { backgroundColor: palette.rule }]} />
        </View>
      </GestureDetector>

      <Ledger
        level={level}
        machine={machine}
        palette={palette}
        highlight={highlightIds}
        openRow={openRow}
        onOpenRow={setOpenRow}
        onFocusTransition={focusTransition}
        onUpdate={(tid, patch) => game.updateTransition(levelId, tid, patch)}
        onDelete={(tid) => game.deleteTransition(levelId, tid)}
        onFillGap={(from, symbol) => {
          const tid = game.addTransition(levelId, defaultTransition(from, from, symbol));
          haptics.commit();
          setOpenRow(tid);
        }}
        onAddRule={() => {
          const first = machine.states[0];
          if (!first) return;
          const from = selection?.kind === 'state' ? selection.id : first.id;
          const tid = game.addTransition(levelId, defaultTransition(from, from));
          haptics.commit();
          setOpenRow(tid);
        }}
      />

      {errorText ? (
        <View style={[styles.status, { backgroundColor: palette.failTint }]}>
          <Text style={{ ...TYPE.small, color: palette.fail }} accessibilityLiveRegion="polite">
            {errorText}
          </Text>
        </View>
      ) : solvedNow ? (
        <View style={[styles.status, { backgroundColor: palette.passTint }]}>
          <Text
            style={{ ...TYPE.small, color: palette.pass, flexShrink: 1 }}
            accessibilityLiveRegion="polite"
          >
            Solved with {machine.states.length}{' '}
            {machine.states.length === 1 ? 'state' : 'states'}, par {level.par}
            {shownHere ? ', shown' : ''}
          </Text>
          <View style={{ flex: 1 }} />
          {nextLevel ? (
            <Pressable
              testID="next-level"
              onPress={() => router.replace(`/level/${nextLevel.id}`)}
              accessibilityRole="button"
              accessibilityLabel="Next level"
              hitSlop={8}
            >
              <Text style={{ ...TYPE.small, color: palette.pass, fontWeight: '700' }}>
                Next level ›
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : counter ? (
        <Pressable
          testID="counterexample"
          onPress={() => openTrace(counter.input)}
          accessibilityRole="button"
          accessibilityLabel={`Shortest disagreement, ${
            counter.input === '' ? 'the empty string' : counter.input
          }. Steps through it.`}
          style={[styles.status, { backgroundColor: palette.surfaceSunken }]}
        >
          <Text style={{ ...TYPE.small, color: palette.muted, flexShrink: 1 }}>
            Shortest disagreement{' '}
            <Text style={{ ...TYPE.monoSmall, color: palette.fail }}>
              {counter.input === '' ? EPSILON : counter.input}
            </Text>
            , the language {counter.expected ? 'accepts' : 'rejects'} it
          </Text>
          <View style={{ flex: 1 }} />
          <Text style={{ ...TYPE.small, color: palette.accentInk, fontWeight: '600' }}>Step ›</Text>
        </Pressable>
      ) : null}

      <SuiteStrip
        palette={palette}
        suite={suite}
        neutral={!wellFormed}
        neutralReason={machine.states.length === 0 ? 'nothing drawn' : 'not a machine yet'}
        selected={trace?.input ?? null}
        onSelect={openTrace}
        solved={solvedNow}
      />

      <View
        testID="toolbar"
        style={[
          styles.toolbar,
          { borderTopColor: palette.rule, paddingBottom: Math.max(insets.bottom, SPACE.md) },
        ]}
      >
        <Tool label="＋ State" palette={palette} testID="add-state" onPress={addState} />
        <Tool
          label="Connect"
          palette={palette}
          testID="connect-toggle"
          on={connectArmed}
          onPress={() => setConnectArmed((v) => !v)}
        />
        <Tool
          label="Tidy"
          palette={palette}
          disabled={machine.states.length === 0}
          onPress={() => game.tidy(levelId)}
        />
        <Tool
          label="Undo"
          palette={palette}
          disabled={!game.canUndo(levelId)}
          onPress={() => game.undo(levelId)}
        />
        <Tool
          label="Redo"
          palette={palette}
          disabled={!game.canRedo(levelId)}
          onPress={() => game.redo(levelId)}
        />
        <Tool label="Notes" palette={palette} testID="notes" onPress={() => setSheetTab('level')} />
      </View>

      <LevelSheet
        visible={sheetTab !== null}
        onClose={() => setSheetTab(null)}
        palette={palette}
        level={level}
        machine={machine}
        initial={sheetTab ?? 'level'}
        alreadyShown={shownHere}
        onReveal={() => {
          game.reveal(levelId);
          setSheetTab(null);
          setSelection(null);
          setOpenRow(null);
          setFitToken((t) => t + 1);
        }}
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
            { borderColor: palette.rule, color: palette.ink, backgroundColor: palette.surface },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rename"
          onPress={() => {
            if (renameFor) game.renameState(levelId, renameFor, renameText);
            setRenameFor(null);
          }}
          style={[styles.renameAction, { borderColor: palette.rule }]}
        >
          <Text style={{ ...TYPE.bodyStrong, color: palette.accentInk }}>Rename</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

function Tool({
  label,
  palette,
  onPress,
  disabled,
  on,
  testID,
}: {
  label: string;
  palette: ReturnType<typeof usePalette>;
  onPress: () => void;
  disabled?: boolean;
  on?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label.replace('＋ ', 'Add ')}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(on) }}
      disabled={disabled}
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      style={[
        styles.tool,
        on ? { backgroundColor: palette.accentTintStrong } : null,
        { opacity: disabled ? 0.32 : 1 },
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          ...TYPE.small,
          fontWeight: on ? '700' : '500',
          color: on ? palette.accentInk : palette.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  back: {
    minHeight: 32,
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  diagram: { width: '100%' },
  diagramInner: { flex: 1, overflow: 'hidden' },
  fit: {
    position: 'absolute',
    right: SPACE.sm,
    top: SPACE.sm,
    paddingHorizontal: SPACE.sm,
    height: 26,
    borderRadius: RADIUS.chip,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  grip: {
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({ web: { cursor: 'row-resize' } as object, default: {} }),
  },
  gripBar: { width: 36, height: 2, borderRadius: 1 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    gap: SPACE.sm,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingTop: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tool: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: TAP,
    borderRadius: RADIUS.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  input: {
    minHeight: TAP,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    fontSize: 16,
  },
  renameAction: {
    marginTop: SPACE.md,
    minHeight: TAP,
    borderWidth: 1,
    borderRadius: RADIUS.control,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const }, default: {} }),
  },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.lg },
});
