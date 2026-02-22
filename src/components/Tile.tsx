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

export function Tile({ suit, value, isRed, isBack, isRotated, className = '', size = 'selector' }: Props) {
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

    const src = `/tiles/${filename}.png`;

    // 2. Responsive/Fixed Size
    // hand: max-h-[60px] w-auto (fit in 1 line)
    // selector: h-[80px] w-auto (fixed, traditional)
    // result: h-[70px] w-auto

    let sizeClass = '';
    if (size === 'hand') {
        // Hand: Larger size for better visibility (96px)
        sizeClass = 'h-[96px] w-auto';
    } else if (size === 'selector') {
        sizeClass = 'h-[60px] md:h-[80px] w-auto';
    } else if (size === 'result') {
        sizeClass = 'h-[50px] md:h-[70px] w-auto';
    } else if (size === 'dora') {
        sizeClass = 'h-[64px] w-auto';
    } else if (size === 'small') {
        sizeClass = 'h-[40px] w-auto';
    }

    return (
        <img
            src={src}
            alt={`${suit}${value}${isRed ? 'r' : ''}`}
            className={`${sizeClass} object-contain shadow-md rounded-sm select-none ${isRotated ? 'tile-rotated' : ''} ${className}`}
            draggable={false}
        />
    );
}
