import { BLOCKS } from '../engine/blocks'
import { useInventoryStore } from '../store/inventoryStore'
import { useUIStore } from '../store/uiStore'

/**
 * InventoryPanel
 * -------------
 * A centered, semi-transparent overlay listing the 5 placeable block types in
 * a grid. Clicking a type selects it (sets the hotbar's selectedBlockType) and
 * closes the panel, which also re-locks the pointer (handled by the toggle
 * hook's close path — we just flip inventoryOpen and request pointer lock).
 *
 * For now the panel mirrors the hotbar's 5 types with no stacking/quantities;
 * that expands later. No drag-and-drop.
 *
 * The overlay root has pointerEvents:'auto' so clicks land here rather than
 * passing through to the (unlocked) canvas. Cells are buttons for a11y.
 */
export default function InventoryPanel() {
  const open = useUIStore((s) => s.inventoryOpen)
  const setInventoryOpen = useUIStore((s) => s.setInventoryOpen)
  const hotbarTypes = useInventoryStore((s) => s.hotbarTypes)
  const selectedBlockType = useInventoryStore((s) => s.selectedBlockType)
  const setSelectedBlockType = useInventoryStore((s) => s.setSelectedBlockType)

  if (!open) return null

  const pick = (type: number) => {
    setSelectedBlockType(type)
    // Close panel + re-engage pointer lock (click is a user gesture).
    const canvas = document.querySelector('canvas')
    canvas?.requestPointerLock()
    setInventoryOpen(false)
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        zIndex: 30,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          padding: 18,
          borderRadius: 12,
          background: 'rgba(20,20,22,0.92)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          color: '#fff',
          font: 'system-ui',
          minWidth: 300,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1,
            marginBottom: 14,
            textTransform: 'uppercase',
            opacity: 0.85,
          }}
        >
          Inventory · click to select
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 72px)',
            gap: 10,
          }}
        >
          {hotbarTypes.map((type) => {
            const def = BLOCKS[type]
            const selected = type === selectedBlockType
            return (
              <button
                key={type}
                onClick={() => pick(type)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 6px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                  border: selected
                    ? '2px solid #fff'
                    : '2px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  font: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 5,
                    background: `#${(def?.color ?? 0x000000).toString(16).padStart(6, '0')}`,
                    border: '1px solid rgba(0,0,0,0.4)',
                  }}
                />
                <span style={{ fontSize: 11, opacity: 0.9 }}>
                  {def?.name ?? '?'}
                </span>
              </button>
            )
          })}
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 11,
            opacity: 0.5,
            textAlign: 'center',
          }}
        >
          Press E to close
        </div>
      </div>
    </div>
  )
}