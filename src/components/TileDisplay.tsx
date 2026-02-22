import { getTileType, getTileNumber, isRedFive } from '../core/tile';
import type { Tile as TileType } from '../core/tile';
import { Tile } from './Tile';

type Props = {
    tile: TileType;
    onClick?: () => void;
    selected?: boolean;
    isBack?: boolean;
    isRotated?: boolean;
    className?: string;
    size?: 'hand' | 'selector' | 'result' | 'dora' | 'small';
    flat?: boolean;
};

export function TileDisplay({
    tile,
    onClick,
    selected,
    isBack,
    isRotated,
    className = '',
    size,
    flat = false
}: Props) {
    const type = getTileType(tile); // 'm','p','s','z'
    const num = getTileNumber(tile);
    const isRed = isRedFive(tile);

    const interactiveStyle = `
        relative cursor-pointer transition-transform duration-200 
        hover:scale-105 hover:shadow-xl w-full
        ${selected ? '-translate-y-2' : ''}
    `;

    const flatStyle = `
        relative w-full
    `;

    const wrapperStyle = `
        ${flat ? flatStyle : interactiveStyle}
        ${className} 
    `;

    return (
        <div className={wrapperStyle} onClick={flat ? undefined : onClick}>
            <Tile suit={type} value={num} isRed={isRed} size={size} isBack={isBack} isRotated={isRotated} />
        </div>
    );
}
