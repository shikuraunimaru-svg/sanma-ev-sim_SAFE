# Sanma EV Simulator (Three-Player Mahjong Attack EV)

A web-based simulator to calculate the Expected Value (EV) of discards in Three-Player Mahjong (Sanma), considering Tsumo win rates and average scores.

## Features
- **Monte Carlo Simulation**: Simulates thousands of games to estimate win probabilities.
- **EV Calculation**: Calculates Expected Value (Win Rate * Average Score) for each valid discard.
- **Parallel Processing**: Uses Web Workers to run simulations without freezing the UI.
- **Sanma Rules**: Handles 35-tile walls, North (Pei) as Kita/Dora, and 1-9 Manzu exclusion.
- **Responsive UI**: Built with React and Tailwind CSS.

## Setup & Running
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open your browser at `http://localhost:5173`.

## Usage
1. **Input Hand**: Click on tiles in the "Hand Input" section to build your 14-tile hand (or 13 tiles + draw).
2. **Settings**:
   - **Dora Indicators**: Select tiles that are the Dora indicators.
   - **Kita**: Set the number of Kita (North) tiles you have declared.
   - **Trials**: Set the number of simulation trials per discard (default 1000). Higher is more accurate but slower.
3. **Run Simulation**: Click the "Run Simulation" button.
4. **View Results**: The table will show the Win Rate, Average Score, and EV for each possible discard. The best discard is highlighted.

## Known Limitations (MVP)
- **Yaku Support**: Basic Yaku (Riichi, Tsumo, Tanyao, Yakuhai, Honitsu, Chinitsu) are implemented. Complex Yaku or specific pattern detection (like exact ChiiToitsu wait logic) may be simplified.
- **Wait Detection**: Wait detection (`getAgariPatterns`) is simplified and may not catch all complex multi-wait shapes perfectly.
- **Opponent Logic**: Simulation assumes "Solitaire" play (draw/discard) to calculate *Attack EV*. It does not fully model opponent attacks or Ron probabilities yet.
- **Mentsu Parsing**: The hand parser is a basic recursive backtracking implementation.

## Tech Stack
- Vite
- React (TypeScript)
- Tailwind CSS
- Web Workers
