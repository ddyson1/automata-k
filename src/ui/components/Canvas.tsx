/**
 * The diagram.
 *
 * Two rules from section 8 shape everything here.
 *
 * 1. Arrows are drawn by hand. No SVG markers: heads are filled triangles
 *    placed at the curve's tangent (see ui/geometry.ts).
 * 2. Drag never touches React state. Live positions live in one Reanimated
 *    shared value; the edge paths, the arrow heads, the node transforms and the
 *    label chips all derive from it on the UI thread. One commit lands on
 *    release.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { transitionChip, transitionSpeech } from '../../engine/formal';
import { CANVAS, type Frame, type Level, type Machine, type StateId } from '../../engine/types';
import {
  buildEdges,
  chipAnchor,
  CHIP_ROW_HEIGHT,
  edgesPathData,
  HIT_RADIUS,
  STATE_RADIUS,
  type EdgeSpec,
  type Positions,
} from '../geometry';
import * as haptics from '../haptics';
import { RADIUS, SPRING, TYPE, type Palette } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Chip stacks are laid out in a fixed box and centred on the edge's anchor. */
const CHIP_BOX_W = 240;
const CHIP_BOX_H = 96;

export type Selection =
  | { kind: 'state'; id: StateId }
  | { kind: 'edge'; key: string }
  | null;

export interface CanvasProps {
  level: Level;
  machine: Machine;
  palette: Palette;
  /** Screen size of the card the canvas is drawn into. */
  width: number;
  height: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Connect mode: the next state tapped becomes the arrow's target. */
  connectFrom: StateId | null;
  onConnect: (from: StateId, to: StateId) => void;
  onMoveState: (id: StateId, x: number, y: number) => void;
  onRenameState: (id: StateId) => void;
  onBackgroundTap: (x: number, y: number) => void;
  /** Arrows the formal panel is pointing at. */
  highlightTransitionIds: readonly string[];
  /** Active trace frame, or null when the player is closed. */
  frame: Frame | null;
  /** Bumped by the parent to request a fit to content. */
  fitToken: number;
  /** State the formal panel asked to centre on. */
  centreOn: { id: StateId; token: number } | null;
}

const clamp = (v: number, lo: number, hi: number): number => {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
};

export function Canvas(props: CanvasProps) {
  const {
    level,
    machine,
    palette,
    width,
    height,
    selection,
    onSelect,
    connectFrom,
    onConnect,
    onMoveState,
    onRenameState,
    onBackgroundTap,
    highlightTransitionIds,
    frame,
    fitToken,
    centreOn,
  } = props;

  // Live positions. The single source of truth while a drag is in flight.
  const positions = useSharedValue<Positions>({});
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const pinchStart = useSharedValue(1);
  // Rubber band shown while dragging a new arrow out of a state's rim.
  const rubber = useSharedValue({ on: 0, x1: 0, y1: 0, x2: 0, y2: 0 });

  const positionKey = machine.states.map((s) => `${s.id}:${s.x}:${s.y}`).join('|');

  useEffect(() => {
    const next: Positions = {};
    for (const s of machine.states) next[s.id] = { x: s.x, y: s.y };
    positions.value = next;
    // positionKey covers both membership and committed coordinates.
  }, [positionKey, positions, machine.states]);

  useEffect(() => {
    if (!centreOn) return;
    const target = machine.states.find((s) => s.id === centreOn.id);
    if (!target) return;
    const s = scale.value;
    tx.value = withSpring(width / 2 - target.x * s, SPRING);
    ty.value = withSpring(height / 2 - target.y * s, SPRING);
  }, [centreOn, machine.states, width, height, scale, tx, ty]);

  // -------------------------------------------------------------------------
  // edge model
  // -------------------------------------------------------------------------

  const edges = useMemo(
    () =>
      buildEdges(
        machine.transitions.map((t) => ({
          id: t.id,
          from: t.from,
          to: t.to,
          chip: transitionChip(t, level.type),
        })),
      ),
    [machine.transitions, level.type],
  );

  // Fit to content, not to the logical canvas: an empty level shows the whole
  // board, a drawn one frames the machine plus every label chip hanging off it.
  const bounds = useMemo(() => {
    if (machine.states.length === 0) {
      return { x: 0, y: 0, w: CANVAS.width, h: CANVAS.height };
    }
    const committed: Positions = {};
    for (const s of machine.states) committed[s.id] = { x: s.x, y: s.y };

    const margin = STATE_RADIUS + 16;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const grow = (x: number, y: number, pad: number) => {
      left = Math.min(left, x - pad);
      top = Math.min(top, y - pad);
      right = Math.max(right, x + pad);
      bottom = Math.max(bottom, y + pad);
    };

    for (const s of machine.states) grow(s.x, s.y, margin);
    for (const e of edges) {
      const a = chipAnchor(e, committed);
      grow(a.x, a.y, (Math.max(1, e.chips.length) * CHIP_ROW_HEIGHT) / 2 + 8);
    }

    return {
      x: left,
      y: top,
      w: Math.max(120, right - left),
      h: Math.max(120, bottom - top),
    };
  }, [machine.states, edges]);

  const fit = useRef({ token: 0, w: 0, h: 0 });
  useEffect(() => {
    const last = fit.current;
    if (last.token === fitToken && last.w === width && last.h === height) return;
    fit.current = { token: fitToken, w: width, h: height };
    const base = Math.min(3, Math.max(0.45, Math.min(width / bounds.w, height / bounds.h)));
    scale.value = withSpring(base, SPRING);
    tx.value = withSpring((width - bounds.w * base) / 2 - bounds.x * base, SPRING);
    ty.value = withSpring((height - bounds.h * base) / 2 - bounds.y * base, SPRING);
  }, [fitToken, width, height, bounds, scale, tx, ty]);

  const litIds = useMemo(() => new Set(highlightTransitionIds), [highlightTransitionIds]);
  const isLit = (e: EdgeSpec): boolean =>
    (selection?.kind === 'edge' && selection.key === e.key) ||
    e.transitionIds.some((id) => litIds.has(id));

  const plainEdges = useMemo(() => edges.filter((e) => !isLit(e)), [edges, selection, litIds]);
  const litEdges = useMemo(() => edges.filter(isLit), [edges, selection, litIds]);

  const plainProps = useAnimatedProps(() => ({
    d: edgesPathData(plainEdges, positions.value).strokes,
  }));
  const plainHeadProps = useAnimatedProps(() => ({
    d: edgesPathData(plainEdges, positions.value).heads,
  }));
  const litProps = useAnimatedProps(() => ({
    d: edgesPathData(litEdges, positions.value).strokes,
  }));
  const litHeadProps = useAnimatedProps(() => ({
    d: edgesPathData(litEdges, positions.value).heads,
  }));
  const rubberProps = useAnimatedProps(() => {
    const r = rubber.value;
    return {
      d: r.on ? `M${r.x1} ${r.y1}L${r.x2} ${r.y2}` : '',
      opacity: r.on,
    };
  });

  // -------------------------------------------------------------------------
  // canvas level gestures: pinch to zoom, two finger pan, tap to deselect
  // -------------------------------------------------------------------------

  const pinch = Gesture.Pinch()
    .onStart(() => {
      pinchStart.value = scale.value;
    })
    .onUpdate((e) => {
      const next = clamp(pinchStart.value * e.scale, 0.45, 3);
      // Keep the pinch focus fixed on screen.
      const k = next / scale.value;
      tx.value = e.focalX - (e.focalX - tx.value) * k;
      ty.value = e.focalY - (e.focalY - ty.value) * k;
      scale.value = next;
    });

  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .averageTouches(true)
    .onChange((e) => {
      tx.value += e.changeX;
      ty.value += e.changeY;
    });

  const backgroundTap = Gesture.Tap().onEnd((e, ok) => {
    if (!ok) return;
    const x = (e.x - tx.value) / scale.value;
    const y = (e.y - ty.value) / scale.value;
    runOnJS(onBackgroundTap)(x, y);
  });

  const canvasGesture = Gesture.Race(
    Gesture.Simultaneous(pinch, twoFingerPan),
    backgroundTap,
  );

  const viewportStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  // -------------------------------------------------------------------------

  const activeStates = useMemo(() => new Set(frame?.active ?? []), [frame]);
  const speech = (id: StateId): string => {
    const s = machine.states.find((n) => n.id === id);
    if (!s) return '';
    const roles = [
      machine.start === id ? 'start state' : null,
      machine.accepting.includes(id) ? 'accepting state' : null,
    ].filter(Boolean);
    return `State ${s.label}${roles.length ? `, ${roles.join(', ')}` : ''}`;
  };

  return (
    <GestureDetector gesture={canvasGesture}>
      <View style={[styles.clip, { width, height }]} collapsable={false}>
        <Animated.View
          style={[
            { width: CANVAS.width, height: CANVAS.height, transformOrigin: 'top left' },
            viewportStyle,
          ]}
        >
          <Svg
            width={CANVAS.width}
            height={CANVAS.height}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <AnimatedPath
              animatedProps={plainProps}
              stroke={palette.muted}
              strokeWidth={1.9}
              strokeLinecap="butt"
              fill="none"
            />
            <AnimatedPath animatedProps={plainHeadProps} fill={palette.muted} />
            <AnimatedPath
              animatedProps={litProps}
              stroke={palette.accent}
              strokeWidth={2.6}
              strokeLinecap="butt"
              fill="none"
            />
            <AnimatedPath animatedProps={litHeadProps} fill={palette.accent} />
            <AnimatedPath
              animatedProps={rubberProps}
              stroke={palette.accent}
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="none"
            />
            {machine.start !== null ? (
              <StartMarker machine={machine} palette={palette} positions={positions} />
            ) : null}
          </Svg>

          {edges.map((edge) => (
            <ChipStack
              key={edge.key}
              edge={edge}
              positions={positions}
              palette={palette}
              lit={isLit(edge)}
              onPress={() => {
                haptics.tick();
                onSelect({ kind: 'edge', key: edge.key });
              }}
            />
          ))}

          {machine.states.map((s) => (
            <StateNode
              key={s.id}
              id={s.id}
              label={s.label}
              palette={palette}
              positions={positions}
              scale={scale}
              isStart={machine.start === s.id}
              isAccepting={machine.accepting.includes(s.id)}
              isSelected={selection?.kind === 'state' && selection.id === s.id}
              isActive={activeStates.has(s.id)}
              isConnectSource={connectFrom === s.id}
              speech={speech(s.id)}
              onTap={() => {
                if (connectFrom && connectFrom !== null) {
                  haptics.commit();
                  onConnect(connectFrom, s.id);
                  return;
                }
                haptics.tick();
                onSelect({ kind: 'state', id: s.id });
              }}
              onLongPress={() => {
                haptics.commit();
                onRenameState(s.id);
              }}
              onMoved={onMoveState}
            />
          ))}

          {selection?.kind === 'state' ? (
            <RimHandle
              id={selection.id}
              positions={positions}
              scale={scale}
              rubber={rubber}
              palette={palette}
              onConnect={onConnect}
            />
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// start marker
// ---------------------------------------------------------------------------

function StartMarker({
  machine,
  palette,
  positions,
}: {
  machine: Machine;
  palette: Palette;
  positions: SharedValue<Positions>;
}) {
  const startId = machine.start as StateId;
  const animated = useAnimatedProps(() => {
    const p = positions.value[startId];
    if (!p) return { d: '' };
    const x = p.x - STATE_RADIUS;
    const y = p.y;
    return {
      d: `M${x - 24} ${y}L${x - 4} ${y}M${x - 11} ${y - 6}L${x - 4} ${y}L${x - 11} ${y + 6}`,
    };
  });
  return (
    <AnimatedPath
      animatedProps={animated}
      stroke={palette.ink}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

// ---------------------------------------------------------------------------
// a state
// ---------------------------------------------------------------------------

interface StateNodeProps {
  id: StateId;
  label: string;
  palette: Palette;
  positions: SharedValue<Positions>;
  scale: SharedValue<number>;
  isStart: boolean;
  isAccepting: boolean;
  isSelected: boolean;
  isActive: boolean;
  isConnectSource: boolean;
  speech: string;
  onTap: () => void;
  onLongPress: () => void;
  onMoved: (id: StateId, x: number, y: number) => void;
}

function StateNode(p: StateNodeProps) {
  const press = useSharedValue(0);

  const style = useAnimatedStyle(() => {
    const at = p.positions.value[p.id] ?? { x: 0, y: 0 };
    return {
      transform: [
        { translateX: at.x - HIT_RADIUS },
        { translateY: at.y - HIT_RADIUS },
        { scale: 1 + press.value * 0.06 },
      ],
    };
  });

  const pan = Gesture.Pan()
    .minDistance(4)
    .onStart(() => {
      press.value = withSpring(1, SPRING);
    })
    .onChange((e) => {
      const cur = p.positions.value;
      const at = cur[p.id];
      if (!at) return;
      const s = p.scale.value || 1;
      p.positions.value = {
        ...cur,
        [p.id]: {
          x: clamp(at.x + e.changeX / s, STATE_RADIUS, CANVAS.width - STATE_RADIUS),
          y: clamp(at.y + e.changeY / s, STATE_RADIUS, CANVAS.height - STATE_RADIUS),
        },
      };
    })
    .onEnd(() => {
      const at = p.positions.value[p.id];
      press.value = withSpring(0, SPRING);
      if (at) runOnJS(p.onMoved)(p.id, Math.round(at.x), Math.round(at.y));
    });

  const tap = Gesture.Tap()
    .maxDuration(320)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(p.onTap)();
    });

  const long = Gesture.LongPress()
    .minDuration(480)
    .onStart(() => {
      runOnJS(p.onLongPress)();
    });

  const gesture = Gesture.Race(pan, long, tap);

  const ring = p.isSelected || p.isConnectSource ? p.palette.accent : p.palette.ink;
  const fill = p.isActive
    ? p.palette.accentTintStrong
    : p.isSelected
      ? p.palette.accentTint
      : p.palette.surface;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.node, style]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={p.speech}
        accessibilityHint="Double tap to select. Long press to rename."
      >
        <Svg width={HIT_RADIUS * 2} height={HIT_RADIUS * 2} pointerEvents="none">
          {p.isActive ? (
            <Circle
              cx={HIT_RADIUS}
              cy={HIT_RADIUS}
              r={STATE_RADIUS + 6}
              fill="none"
              stroke={p.palette.accent}
              strokeWidth={1.5}
              opacity={0.4}
            />
          ) : null}
          <Circle
            cx={HIT_RADIUS}
            cy={HIT_RADIUS}
            r={STATE_RADIUS}
            fill={fill}
            stroke={ring}
            strokeWidth={p.isSelected || p.isConnectSource ? 2.6 : 1.8}
          />
          {p.isAccepting ? (
            <Circle
              cx={HIT_RADIUS}
              cy={HIT_RADIUS}
              r={STATE_RADIUS - 5}
              fill="none"
              stroke={ring}
              strokeWidth={p.isSelected ? 2 : 1.4}
            />
          ) : null}
        </Svg>
        <View style={styles.nodeLabel} pointerEvents="none">
          <Text
            numberOfLines={1}
            style={{
              ...TYPE.mono,
              fontSize: 13,
              color: p.palette.ink,
              fontWeight: '600',
            }}
          >
            {p.label}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// drag an arrow out of a state's rim
// ---------------------------------------------------------------------------

function RimHandle({
  id,
  positions,
  scale,
  rubber,
  palette,
  onConnect,
}: {
  id: StateId;
  positions: SharedValue<Positions>;
  scale: SharedValue<number>;
  rubber: SharedValue<{ on: number; x1: number; y1: number; x2: number; y2: number }>;
  palette: Palette;
  onConnect: (from: StateId, to: StateId) => void;
}) {
  const style = useAnimatedStyle(() => {
    const at = positions.value[id] ?? { x: 0, y: 0 };
    return {
      transform: [
        { translateX: at.x + STATE_RADIUS - 16 },
        { translateY: at.y - STATE_RADIUS - 6 },
      ],
      opacity: rubber.value.on ? 0.3 : 1,
    };
  });

  const pan = Gesture.Pan()
    .onStart(() => {
      const at = positions.value[id];
      if (!at) return;
      rubber.value = { on: 1, x1: at.x, y1: at.y, x2: at.x, y2: at.y };
    })
    .onChange((e) => {
      const r = rubber.value;
      const s = scale.value || 1;
      rubber.value = { ...r, x2: r.x2 + e.changeX / s, y2: r.y2 + e.changeY / s };
    })
    .onEnd(() => {
      const r = rubber.value;
      rubber.value = { on: 0, x1: 0, y1: 0, x2: 0, y2: 0 };
      let hit: string | null = null;
      const all = positions.value;
      for (const key in all) {
        const p = all[key];
        if (!p) continue;
        if (Math.hypot(p.x - r.x2, p.y - r.y2) <= HIT_RADIUS) {
          hit = key;
          break;
        }
      }
      if (hit !== null) runOnJS(onConnect)(id, hit);
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.rim, style]}
        accessibilityRole="button"
        accessibilityLabel="Drag to another state to draw an arrow"
      >
        <View
          style={[
            styles.rimDot,
            { backgroundColor: palette.accent, borderColor: palette.surface },
          ]}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// label chips
// ---------------------------------------------------------------------------

function ChipStack({
  edge,
  positions,
  palette,
  lit,
  onPress,
}: {
  edge: EdgeSpec;
  positions: SharedValue<Positions>;
  palette: Palette;
  lit: boolean;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const a = chipAnchor(edge, positions.value);
    return {
      transform: [{ translateX: a.x - CHIP_BOX_W / 2 }, { translateY: a.y - CHIP_BOX_H / 2 }],
      opacity: withTiming(a.x === 0 && a.y === 0 ? 0 : 1, { duration: 80 }),
    };
  });

  return (
    <Animated.View style={[styles.chipStack, style]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        hitSlop={10}
        style={styles.chipColumn}
        accessibilityRole="button"
        accessibilityLabel={`Arrow labelled ${edge.chips.join(', ')}`}
      >
        {edge.chips.map((chip, i) => (
          <View
            key={`${edge.key}-${i}`}
            style={[
              styles.chip,
              {
                backgroundColor: lit ? palette.accentTintStrong : palette.surface,
                borderColor: lit ? palette.accent : palette.hairline,
              },
            ]}
          >
            <Text
              style={{
                ...TYPE.monoSmall,
                color: lit ? palette.accentInk : palette.ink,
              }}
              numberOfLines={1}
            >
              {chip}
            </Text>
          </View>
        ))}
      </Pressable>
    </Animated.View>
  );
}

/** Exported for the accessible text alternative to the diagram. */
export const describeTransition = transitionSpeech;

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    ...Platform.select({ web: { cursor: 'grab' } as object, default: {} }),
  },
  node: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: HIT_RADIUS * 2,
    height: HIT_RADIUS * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rim: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rimDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  chipStack: {
    position: 'absolute',
    left: 0,
    top: 0,
    // Wide enough that a TM chip such as "Y → Y, L" never truncates.
    width: CHIP_BOX_W,
    height: CHIP_BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.chip,
    borderWidth: 1,
    minHeight: 18,
    justifyContent: 'center',
  },
});
