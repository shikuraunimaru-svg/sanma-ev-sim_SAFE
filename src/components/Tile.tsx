import type { TileType } from '../core/tile';

type TileSize = 'hand' | 'selector' | 'result' | 'dora' | 'small';

type Props = {
    suit: TileType;
    value: number;
    isRed?: boolean;
    isBack?: boolean;
    isRotated?: boolean;
    className?: string;
    size?: TileSize; // Default 'selector'
};

export function Tile({ suit, value, isRed, isBack, isRotated, className = '' }: Props) {
    // 1. Generate Image Path
    let filename = '';

    if (isBack) {
        filename = 'ura';
    } else if (isRed && value === 5) {
        if (suit === 'p') filename = '5pr';
        else if (suit === 's') filename = '5sr';
        else filename = `${value}${suit}`;
    } else if (suit === 'z') {
        const map = ['east', 'south', 'west', 'north', 'haku', 'hatsu', 'chun'];
        if (value >= 1 && value <= 7) {
            filename = map[value - 1];
        } else {
            filename = 'back';
        }
    } else {
        filename = `${value}${suit}`;
    }

    const src = `${import.meta.env.BASE_URL}images/${filename}.png`;


    const sizeClass = 'w-10 h-auto';

    return (
        <img
            src={src}
            alt={`${suit}${value}${isRed ? 'r' : ''}`}
            className={`${sizeClass} !max-w-none object-contain shadow-md rounded-sm select-none ${isRotated ? 'tile-rotated' : ''} ${className}`}
            draggable={false}
        />
    );
}
