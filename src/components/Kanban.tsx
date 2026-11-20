import { useEffect, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'

export interface KanbanColumn { id: string; label: string; color?: string | null }

interface Props<T extends { id: string }> {
  columns: KanbanColumn[]
  items: T[]
  columnOf: (item: T) => string | null
  renderCard: (item: T) => ReactNode
  onOpen: (item: T) => void
  /** Chamado ao soltar um cartão em outra coluna. */
  onMove?: (item: T, columnId: string) => void
  canDrag?: (item: T) => boolean
  emptyText?: string
}

/**
 * Quadro kanban com arrastar e soltar (mouse, toque e teclado).
 * Clique abre o cartão; arrastar (a partir de 6px ou toque longo) move entre colunas.
 * A barra de rolagem horizontal fica acima dos títulos.
 */
export function Kanban<T extends { id: string }>({ columns, items, columnOf, renderCard, onOpen, onMove, canDrag, emptyText = 'Arraste um cartão para cá' }: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const [active, setActive] = useState<T | null>(null)
  // movimento otimista: o cartão já aparece na coluna nova enquanto o banco salva
  const [pending, setPending] = useState<Record<string, string>>({})
  const signature = items.map((i) => `${i.id}:${columnOf(i)}`).join('|')
  useEffect(() => { setPending({}) }, [signature])
  const colOf = (i: T) => pending[i.id] ?? columnOf(i)

  const start = (e: DragStartEvent) => setActive(items.find((i) => i.id === e.active.id) ?? null)
  const end = (e: DragEndEvent) => {
    setActive(null)
    const item = items.find((i) => i.id === e.active.id)
    const to = e.over?.id as string | undefined
    if (item && to && to !== colOf(item)) {
      setPending((p) => ({ ...p, [item.id]: to }))
      onMove?.(item, to)
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={start} onDragEnd={end} onDragCancel={() => setActive(null)}
      accessibility={{ screenReaderInstructions: { draggable: 'Pressione espaço para pegar o cartão, setas para mover e espaço para soltar.' } }}>
      <div className="kb-scroll">
        <div className="kb">
          {columns.map((c) => {
            const list = items.filter((i) => colOf(i) === c.id)
            return (
              <Column key={c.id} col={c} count={list.length} emptyText={onMove ? emptyText : ''}>
                {list.map((i) => (
                  <Card key={i.id} id={i.id} disabled={!onMove || (canDrag ? !canDrag(i) : false)} onOpen={() => onOpen(i)}>
                    {renderCard(i)}
                  </Card>
                ))}
              </Column>
            )
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <div className="row kb-card dragging">{renderCard(active)}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ col, count, children, emptyText }: { col: KanbanColumn; count: number; children: ReactNode; emptyText: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })
  return (
    <section className={`col ${isOver ? 'over' : ''}`} aria-label={`${col.label}, ${count} itens`}>
      <h3 style={{ background: col.color ?? '#55555f' }}><span>{col.label}</span><span>{count}</span></h3>
      <div ref={setNodeRef} className="drop">
        {children}
        {!count && emptyText && <p className="drop-hint">{emptyText}</p>}
      </div>
    </section>
  )
}

function Card({ id, disabled, onOpen, children }: { id: string; disabled: boolean; onOpen: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={`row kb-card ${isDragging ? 'ghost' : ''} ${disabled ? '' : 'grab'}`}
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); listeners?.onKeyDown?.(e) }}>
      {children}
    </div>
  )
}
