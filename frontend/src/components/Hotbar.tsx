import { BLOCKS } from '../engine/blocks'
import { useInventoryStore } from '../store/inventoryStore'
import { useHotbarKeys } from '../hooks/useHotbarKeys'

/**
 * Hotbar
 * -----
 * Bottom-centre row of 5 block slots. Each slot shows a colored square (the
 * block's palette color) plus the number-key that selects it. The currently
 * selected slot gets a highlighted border/background. Styled with plain inline
 * styles — no CSS framework / extra deps for this project yet.
 *
 * `pointerEvents: 'none'` on the row keeps clicks from landing on the DOM
 * overlay and instead passing through to the locked canvas (so gameplay clicks
 * still break/place). Selection only happens via the number keys.
 */
export default function Hotbar() {
  useHotbarKeys()
  const hotbarTypes = useInventoryStore((s) => s.hotbarTypes)
  const selectedBlockType = useInventoryStore((s) => s.selectedBlockType)

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {hotbarTypes.map((type, i) => {
        const def = BLOCKS[type]
        const selected = type === selectedBlockType
        return (
          <div
            key={type}
            style={{
              width: 54,
              height: 54,
              position: 'relative',
              border: selected ? '3px solid #ffffff' : '3px solid rgba(255,255,255,0.35)',
              borderRadius: 6,
              background: selected ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.4)',
              boxShadow: selected ? '0 0 8px rgba(255,255,255,0.6)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Block color swatch */}
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 4,
                background: `#${(def?.color ?? 0x000000).toString(16).padStart(6, '0')}`,
                border: '1px solid rgba(0,0,0,0.4)',
              }}
            />
            {/* Slot number badge */}
            <span
              style={{
                position: 'absolute',
                bottom: 2,
                right: 4,
                color: '#fff',
                font: '700 11px system-ui',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                opacity: selected ? 1 : 0.7,
              }}
            >
              {i + 1}
            </span>
            {selected && (
              <span
                style={{
                  position: 'absolute',
                  top: -18,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: '#fff',
                  font: '600 11px system-ui',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 2px rgba(0,0,0,0.85)',
                }}
              >
                {def?.name ?? ''}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}