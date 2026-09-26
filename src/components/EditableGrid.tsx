import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Side } from '../lib/layout';

export interface GridEntry {
  key: string;
  /** Can other tiles be dropped onto the middle of this one (to make/fill a folder)? */
  acceptsDrop: boolean;
  /** Can this tile be dropped onto another tile? (Apps can, folders can't.) */
  canDropOnto: boolean;
  render: () => ReactNode;
  /** Small round button in the top-left corner while editing, like the iPad's "−". */
  badge?: { label: string; symbol: string; onClick: () => void };
  onTap?: () => void;
  /** Grid column span class for wide tiles (folder panes), e.g. 'col-span-3'. */
  span?: string;
}

type Zone = Side | 'onto';
interface Target {
  key: string;
  zone: Zone;
}

const END_KEY = '__end__';

/**
 * A wiggling grid of tiles you can drag around. Dropping on the left/right edge
 * of a tile puts it before/after; dropping on the middle puts it inside.
 */
export function EditableGrid({
  entries,
  onMove,
  onDropOnto,
  onMoveToEnd,
  className,
}: {
  entries: GridEntry[];
  onMove: (fromKey: string, toKey: string, side: Side) => void;
  onDropOnto?: (fromKey: string, toKey: string) => void;
  onMoveToEnd: (fromKey: string) => void;
  className: string;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold on touch screens, so a normal swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const active = entries.find((e) => e.key === activeKey);

  function pointerX(event: DragMoveEvent): number | null {
    const start = event.activatorEvent;
    let x: number | null = null;
    if (start instanceof MouseEvent) x = start.clientX;
    else if (typeof TouchEvent !== 'undefined' && start instanceof TouchEvent) x = start.touches[0]?.clientX ?? null;
    return x === null ? null : x + event.delta.x;
  }

  function handleMove(event: DragMoveEvent) {
    const over = event.over;
    if (!over || over.id === event.active.id) return setTarget(null);
    const key = String(over.id);
    if (key === END_KEY) return setTarget({ key, zone: 'after' });

    const x = pointerX(event);
    const rel = x === null ? 0.5 : (x - over.rect.left) / over.rect.width;
    const overEntry = entries.find((e) => e.key === key);
    const merge = Boolean(onDropOnto && active?.canDropOnto && overEntry?.acceptsDrop);
    let zone: Zone;
    if (merge) zone = rel < 0.28 ? 'before' : rel > 0.72 ? 'after' : 'onto';
    else zone = rel < 0.5 ? 'before' : 'after';
    setTarget((prev) => (prev?.key === key && prev.zone === zone ? prev : { key, zone }));
  }

  function handleEnd(event: DragEndEvent) {
    const from = String(event.active.id);
    const t = target;
    setActiveKey(null);
    setTarget(null);
    if (!t || !event.over) return;
    if (t.key === END_KEY) onMoveToEnd(from);
    else if (t.zone === 'onto') onDropOnto?.(from, t.key);
    else onMove(from, t.key, t.zone);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setActiveKey(String(e.active.id))}
      onDragMove={handleMove}
      onDragEnd={handleEnd}
      onDragCancel={() => {
        setActiveKey(null);
        setTarget(null);
      }}
    >
      <div className={className}>
        {entries.map((entry, i) => (
          <Tile
            key={entry.key}
            entry={entry}
            index={i}
            dragging={entry.key === activeKey}
            zone={target?.key === entry.key ? target.zone : null}
          />
        ))}
        <EndSlot highlighted={target?.key === END_KEY} />
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <div className="scale-110 cursor-grabbing opacity-90">{active.render()}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Tile({ entry, index, dragging, zone }: { entry: GridEntry; index: number; dragging: boolean; zone: Zone | null }) {
  const drag = useDraggable({ id: entry.key });
  const drop = useDroppable({ id: entry.key });

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={entry.onTap}
      className={`relative flex touch-manipulation select-none flex-col items-center transition-transform duration-150 ${
        entry.span ? `${entry.span} justify-self-stretch` : 'justify-self-center'
      } ${dragging ? 'opacity-25' : 'cursor-grab'} ${zone === 'onto' ? (entry.span ? 'scale-[1.02]' : 'scale-110') : ''}`}
    >
      {/* Wide panes don't wiggle (it looks shaky at that size); they get a dashed outline instead. */}
      <div className={entry.span ? 'w-full' : dragging ? '' : index % 2 ? 'animate-wiggle-alt' : 'animate-wiggle'}>{entry.render()}</div>
      {entry.span && !dragging && (
        <div className="pointer-events-none absolute inset-0 rounded-[28px] border-2 border-dashed border-white/50" />
      )}

      {zone === 'onto' && (
        <div
          className={`pointer-events-none absolute ring-4 ring-white/80 ${
            entry.span ? 'inset-0 rounded-[28px]' : 'left-1/2 top-0 size-16 -translate-x-1/2 rounded-[22%] sm:size-[72px]'
          }`}
        />
      )}
      {(zone === 'before' || zone === 'after') && (
        <div
          className={`pointer-events-none absolute top-0 w-1 rounded-full bg-white shadow ${entry.span ? 'bottom-0' : 'h-16 sm:h-[72px]'} ${
            zone === 'before' ? '-left-3' : '-right-3'
          }`}
        />
      )}

      {entry.badge && !dragging && (
        <button
          type="button"
          aria-label={entry.badge.label}
          title={entry.badge.label}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            entry.badge!.onClick();
          }}
          className="absolute -left-2 -top-2 z-10 flex size-6 items-center justify-center rounded-full bg-neutral-700/90 text-base leading-none text-white shadow ring-1 ring-white/40 hover:bg-neutral-900"
        >
          {entry.badge.symbol}
        </button>
      )}
    </div>
  );
}

function EndSlot({ highlighted }: { highlighted: boolean }) {
  const { setNodeRef } = useDroppable({ id: END_KEY });
  return (
    <div
      ref={setNodeRef}
      className={`flex size-16 items-center justify-center justify-self-center rounded-[22%] border-2 border-dashed transition-colors sm:size-[72px] ${
        highlighted ? 'border-white bg-white/20' : 'border-white/25'
      }`}
      aria-hidden
    />
  );
}
