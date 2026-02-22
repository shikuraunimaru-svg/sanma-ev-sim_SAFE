# 役判定ロジック監査レポート

## 1. 実装済み役一覧 (`src/core/yaku.ts`)

| 役名 | 翻数 (通常/門前/鳴き) | 判定関数 | 備考 |
|---|---|---|---|
| **立直 (Riichi)** | 1 | `state.isRiichi` | 門前のみ |
| **一発 (Ippatsu)** | 1 | `state.isIppatsu` | 門前のみ |
| **門前清自摸和 (Menzen Tsumo)** | 1 | `state.isTsumo` | 門前のみ |
| **断么九 (Tanyao)** | 1 | `!fullHand.some(isYaochuu)` | |
| **平和 (Pinfu)** | 1 | `isMenzen && allShuntsu && ...` | 門前のみ |
| **一盃口 (Iipeikou)** | 1 | `shuntsuCounts >= 2` | 門前のみ |
| **役牌 (Yakuhai)** | 1 | `m.tile === state.bakaze` 等 | Round(場風), Seat(自風), Haku, Hatsu, Chun |
| **嶺上開花 (Rinshan)** | 1 | `state.isRinshan` | |
| **七対子 (Chiitoitsu)** | 2 | `isChiitoitsu` | 門前のみ (特殊形) |
| **混全帯么九 (Chanta)** | 2 / 1 | `isChanta` | |
| **一気通貫 (Ittsuu)** | 2 / 1 | `isIttsuu` | |
| **三色同刻 (Sanshoku Doukou)** | 2 | `isSanshokuDoukou` | |
| **三暗刻 (San-ankou)** | 2 | `ankouCount >= 3` | |
| **対々和 (Toitoi)** | 2 | `mentsu.every(koutsu/kantsu)` | |
| **三槓子 (Sankantsu)** | 2 | `countKantsu === 3` | |
| **小三元 (Shousangen)** | 2 | `isShousangen` | |
| **混老頭 (Honroutou)** | 2 | `isHonroutou` | |
| **純全帯么九 (Junchan)** | 3 / 2 | `isJunchan` | |
| **混一色 (Honitsu)** | 3 / 2 | `isHonitsu` | |
| **二盃口 (Ryanpeikou)** | 3 | `isRyanpeikou` | 門前のみ |
| **清一色 (Chinitsu)** | 6 / 5 | `isChinitsu` | |
| **国士無双 (Kokushi)** | 13 | `isKokushiMusou` | 役満 |
| **四暗刻 (Suuankou)** | 13 | `isSuuankou` | 役満 (門前のみ) |
| **大三元 (Daisangen)** | 13 | `isDaisangen` | 役満 |
| **字一色 (Tsuiisou)** | 13 | `isTsuiisou` | 役満 |
| **緑一色 (Ryuuiisou)** | 13 | `isRyuuiisou` | 役満 |
| **清老頭 (Chinroutou)** | 13 | `isChinroutou` | 役満 |
| **四槓子 (Suukantsu)** | 13 | `countKantsu >= 4` | 役満 |
| **小四喜 (Shousuushi)** | 13 | `isShousuushi` | 役満 |
| **大四喜 (Daisuushi)** | 13 | `isDaisuushi` | 役満 |
| **九蓮宝燈 (Chuuren Poutou)** | 13 | `isChuurenPoutou` | 役満 |
| **天和 (Tenhou)** | 13 | `state.isTenhou` | 役満 |
| **地和 (Chiihou)** | 13 | `state.isChiihou` | 役満 |

※ **三色同順 (Sanshoku Doujun)** は三麻では通常なし（萬子が1,9しかないため）のため実装されていません。
※ **槍槓 (Chankan)**, **海底 (Haitei)**, **河底 (Houtei)** は `state` にフラグはありますが、`yaku.ts` 内での明示的なプッシュ処理が現在のコードで見当たりません（要追加実装の可能性あり）。ただし、テストコードには含まれていません。

---

## 2. 点数計算フロー

```mermaid
graph TD
    A[evaluateWinningHand (engine.ts)] --> B{国士無双チェック}
    B -- Yes --> C[点数計算 (13翻 0符)]
    B -- No --> D{七対子チェック & Shanten分解 (getAgariPatterns)}
    D --> E[Shanten.ts]
    
    subgraph Shanten_Analysis [面子分解プロセス]
        E --> F[calculateShanten (通常/七対子/国士)]
        F --> G[Agari (Shanten -1) なら分解実行]
        G --> H[getAgariPatterns (27-ID変換)]
        H --> I[searchMentsuDecomposition (再帰探索)]
        I --> J[mentsu配列生成 (Standard IDへ変換)]
    end

    J --> K[Agariパターンリスト]
    K --> L[各パターンについて calculateScore (yaku.ts)]
    
    subgraph Score_Calculation [点数計算]
        L --> M[checkYaku (役判定実行)]
        M --> N[YakuDefリスト生成]
        N --> O[calculateFu (符計算)]
        O --> P[Han/Fu 合計と役満判定]
        P --> Q[点数テーブル参照 (score.ts)]
    end

    Q --> R[最高得点のパターンを採用]
    R --> S[最終結果 (YakuResult)]
```

## 3. 監査結果と修正内容

今回の監査で、以下の重大な不具合を発見・修正しました。

1.  **ID体系の不一致**:
    *   `Shanten` ロジックは「三麻用27種ID」を使用。
    *   `Yaku` ロジックは「標準34種ID」を使用。
    *   修正前: `getAgariPatterns` がID変換を適切に行わず、Koutsu（刻子）やヘッドのIDがずれていました（例: `p1` が `m3` 相当の単純牌として扱われ、断么九が誤成立したり、清一色が不成立になる）。
    *   修正後: `getAgariPatterns` 内で `toStandardTile` を用いて面子・ヘッドのIDを正しく標準IDに変換するように修正しました。

2.  **ループ境界の不具合**:
    *   `searchMentsuDecomposition` が `TILE_COUNT` (34) までループしていましたが、配列サイズは 27 でした。これにより分解が途中で停止していました。これを修正しました。

3.  **検証結果**:
    *   修正後、`123456789p 11m 567s` のような複合形も正しく「一気通貫」等を判定できるようになりました。
    *   「九蓮宝燈」のような複雑な役満も正しく判定されることを確認しました。

## 4. ユニットテスト

`src/core/test_yaku_coverage.ts` を作成し、主要な役の判定を自動テスト済みです。
