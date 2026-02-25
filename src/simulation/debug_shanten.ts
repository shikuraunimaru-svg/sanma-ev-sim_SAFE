
import { TILES } from '../core/tile';
import { calculateShanten } from '../core/shanten';

function removeOneTile(hand: any[], tile: any): any[] {
    const copy = [...hand];
    const index = copy.indexOf(tile);
    if (index !== -1) {
        copy.splice(index, 1);
    }
    return copy;
}

const hand = [
    TILES.m1, TILES.m1,
    TILES.p2, TILES.p2,
    TILES.p5r,
    TILES.s2, TILES.s2, TILES.s2,
    TILES.s5, TILES.s6, TILES.s6, TILES.s7, TILES.s8, TILES.s8
];

console.log("Full initial hand (14 tiles):", hand.map(t => TILES[t] || t));

const before = calculateShanten(hand, 0);
console.log("Before shanten (14 tiles):", before);

// Discard 8s
const handAfter8s = removeOneTile(hand, TILES.s8);
const after8s = calculateShanten(handAfter8s, 0);
console.log("After shanten for 8s discard:", after8s);
console.log("Hand after discard 8s:", handAfter8s.map(t => TILES[t] || t));

// Discard 6s
const handAfter6s = removeOneTile(hand, TILES.s6);
const after6s = calculateShanten(handAfter6s, 0);
console.log("After shanten for 6s discard:", after6s);
console.log("Hand after discard 6s:", handAfter6s.map(t => TILES[t] || t));
