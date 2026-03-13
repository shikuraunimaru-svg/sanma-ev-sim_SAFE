import type { Mentsu } from '../core/shanten';
import { TileDisplay } from './TileDisplay';
import { isRedFive } from '../core/tile';

type Props = {
    mentsu: Mentsu;
    size?: 'hand' | 'selector' | 'result' | 'dora';
};

export function MentsuDisplay({ mentsu, size = 'result' }: Props) {
    // For Concealed Kan (Ankan), we show [ura, middle1, middle2, ura]
    // If a red tile exists, it MUST be one of the middle tiles.
    const displayTiles = [...mentsu.tiles];
    if (mentsu.isKan && !mentsu.isOpen) {
        const redIdx = displayTiles.findIndex(t => isRedFive(t));
        if (redIdx !== -1) {
            // Find a normal tile to pair with it in the middle
            const normalIdx = displayTiles.findIndex((t, i) => !isRedFive(t) && i !== redIdx);
            if (normalIdx !== -1) {
                // Rearrange for UI: [ura(any), red, normal, ura(any)]
                // We keep original array indices but decide which to render as 'ura'
            }
        }
    }

    return (
        <div className={`flex gap-[2px] p-1 rounded border ${mentsu.isOpen ? 'bg-yellow-50 border-yellow-100' : 'bg-blue-50 border-blue-100'}`}>
            {mentsu.tiles.map((t, idx) => {
                let isAnkanUra = false;
                let tileToDisplay = t;

                if (mentsu.isKan && !mentsu.isOpen) {
                    // Traditional style: [ura, visible, visible, ura]
                    // We need to ensure that if a red exists, it's one of the visible ones.
                    const hasRed = mentsu.tiles.some(tile => isRedFive(tile));

                    if (idx === 0 || idx === 3) {
                        isAnkanUra = true;
                    } else {
                        // Middle tiles (idx 1 and 2)
                        if (hasRed) {
                            // If index 1, show red. If index 2, show normal.
                            if (idx === 1) {
                                tileToDisplay = mentsu.tiles.find(tile => isRedFive(tile)) ?? t;
                            } else {
                                tileToDisplay = mentsu.tiles.find(tile => !isRedFive(tile)) ?? t;
                            }
                        }
                        // Otherwise, use default t (tile at index 1 or 2)
                    }
                }

                return (
                    <TileDisplay
                        key={`mentsu-tile-${tileToDisplay}-${idx}`}
                        tile={tileToDisplay}
                        size={size}
                        isBack={isAnkanUra}
                        isRotated={mentsu.isOpen && (mentsu.type === 'koutsu' || mentsu.type === 'kantsu') && idx === 0}
                    />
                );
            })}
        </div>
    );
}
