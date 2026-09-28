import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'

const EXPANDED_FRACTION = 0.85
// A drag farther than this commits to the direction dragged; shorter drags
// snap to whichever state is closer.
const COMMIT_DRAG_PX = 40

/**
 * Two-state (peek / expanded) mobile bottom sheet driven by a drag handle.
 * The sheet height is exposed as the `--sheet-h` CSS variable so desktop
 * styles (md:max-h-none) can still override it.
 */
export function useBottomSheet(peekPx: number) {
  const [open, setOpen] = useState(false)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const expandedPx = () => window.innerHeight * EXPANDED_FRACTION

  const handleProps = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      const sheet = e.currentTarget.closest('aside')
      drag.current = { startY: e.clientY, startHeight: sheet?.getBoundingClientRect().height ?? peekPx, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current
      if (!d) return
      const dy = d.startY - e.clientY
      if (Math.abs(dy) > 4) d.moved = true
      if (d.moved) setDragHeight(Math.min(expandedPx(), Math.max(peekPx, d.startHeight + dy)))
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = drag.current
      drag.current = null
      if (!d || !d.moved) return
      suppressClick.current = true
      const dy = d.startY - e.clientY
      if (dy > COMMIT_DRAG_PX) setOpen(true)
      else if (dy < -COMMIT_DRAG_PX) setOpen(false)
      else setOpen(d.startHeight + dy > (peekPx + expandedPx()) / 2)
      setDragHeight(null)
    },
    onPointerCancel() {
      drag.current = null
      setDragHeight(null)
    },
    onClick() {
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      setOpen((o) => !o)
    },
  }

  const style = {
    '--sheet-h': dragHeight != null ? `${dragHeight}px` : open ? `${EXPANDED_FRACTION * 100}dvh` : `${peekPx}px`,
    ...(dragHeight != null ? { transition: 'none' } : {}),
  } as CSSProperties

  return { open, setOpen, handleProps, style }
}
