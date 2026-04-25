import {getAgariPatterns} from './src/core/shanten';
import {scoreWinningHandFast} from './src/simulation/engine';
import {calculateScore} from './src/core/yaku';

// Case A: Ittsu +1 unexplained
const h1 = [8,8,9,10,11,11,12,12,13,14,15,16,17,34];
const p1 = getAgariPatterns(h1, [])[0];
const s1 = {bakaze:27,jikaze:27,isRiichi:false,isTsumo:false,winningTile:12,doraCount:0,uraDoraCount:0,kitaCount:0,hasCallOccurred:false,isDealer:true,turnCount:5,discardCount:5,isDoubleRiichi:false,isIppatsu:false,isRinshan:false,isChankan:false,isHaitei:false,isHoutei:false} as any;
console.log('CaseA full han:', calculateScore(h1,p1,s1).han, 'yaku:', calculateScore(h1,p1,s1).yaku);
console.log('CaseA fast han:', scoreWinningHandFast(h1,p1,s1).han);

// Let's trace which flags are ON in fast for CaseA:
// mentsu: @9(1-2-3p), @11(3-4-5p), @12(4-5-6p), @15(7-8-9p)  head:8(9m)
// p1=9: YES, p4=12: YES, p7=15: YES => Ittsu p valid => +2
// s1/s4/s7: 0 => no s-ittsu
// Iipeikou: shuntsu tiles: [9,11,12,15], any duplicates? No => pairCnt=0
// Chanta: head=8(9m)=terminal YES, @9(rem=0) ok, @11(rem=2) => NOT 0 or 6 => Chanta FALSE
// Junchan: head=8=terminal, @9 ok, @11 rem=2 => FAIL
// Sanshoku: no kotsu => 0
// Shousangen: head=8, not dragon
// Tanyao: 8(9m)+10(2p)+11(3p)... 8=9m, isYao=true => isTanyao=false, 
//         isHonroutou: 10(2p)=not yao => isHonroutou=false
// So: no tanyao, no honroutou, no chanta
// Then what's +1?
// head=8 (9m). Yakuhai check: bk=27, jk=27, head=8 != 27, not dragon => ok  
// Pinfu: head=8(9m)=terminal, not yakohai. All shuntsu. winTile=12 in @12(4-5-6p), pos=0, sn=(12-8)=4, sn!=1, sn!=7 => ryanmen => hasPinfu=true, han+=1!
// But full scorer: Pinfu NOT in yaku list (only 一気通貫)
// Why doesn't full give Pinfu? head=8=9m is a terminal... Actually 9m IS allowed as pinfu head!
// Wait, the full scorer uses isYakuhaiTile(head) where yakuhai = jikaze/bakaze/z5/z6/z7
// head=8(9m) is NOT yakuhai. And winTile=12 -> ryanmen. So full should give Pinfu too!

console.log('\nFull with explicit state:');
const fullR = calculateScore(h1,p1,s1);
console.log('Full han:', fullR.han, 'yaku:', fullR.yaku);
// If full says only 一気通貫...let me check if head=8 is actually yaochuuhai not yakuhai

// Case C: +1 without ittsu
const h3 = [9,10,11,12,13,13,14,14,15,17,17,18,19,20];
const p3 = getAgariPatterns(h3, [])[0];
const s3 = {bakaze:27,jikaze:27,isRiichi:true,isTsumo:true,winningTile:13,doraCount:0,uraDoraCount:0,kitaCount:0,hasCallOccurred:false,isDealer:true,turnCount:5,discardCount:5,isDoubleRiichi:false,isIppatsu:false,isRinshan:false,isChankan:false,isHaitei:false,isHoutei:false} as any;
console.log('\nCaseC full:', calculateScore(h3,p3,s3).yaku, 'han:', calculateScore(h3,p3,s3).han);
console.log('CaseC fast han:', scoreWinningHandFast(h3,p3,s3).han);
console.log('CaseC mentsu:', p3.mentsu.map(m=>({type:m.type,tile:m.tile})));
// mentsu: @9,@12,@13,@18  head:17(9p)
// Ittsu: p1(9)=1, p4(12)=1, p7(15)=0 => FALSE
// Honroutou: hand has 10(2p)... not yao => false
// Tanyao: 9(1p)=yao => false  
// Pinfu: head=17(9p), not bk=27 not jk=27 not dragon => nonYakuhaiHead=true. All shuntsu. winTile=13 in @13(5-6-7p), pos=0, sn=(13-8)=5, sn!=1 sn!=7 => ryanmen true => hasPinfu += 1
// But riichi+tsumo+pinfu = 3. Full gives riichi+tsumo=2. So full doesn't give pinfu here.
// Why? winTile=13(5p). @13 shuntsu = 5p-6p-7p. winning with 5p at pos=0 is ryanmen for 5-6-7. But wait...
// There are TWO shuntsu containing tile 13: @12(4-5-6p with tile 12) and @13(5-6-7p with tile 13)
// The full scorer uses a loop similar to ours. Does it find ryanmen?
