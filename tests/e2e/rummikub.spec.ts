import { expect, test } from '@playwright/test';
import { createDeck, GameState, Tile } from '../../src/engine';

test.describe('Atelier Rummikub End-to-End Browser Verification', () => {
  test('1. Full gameplay flow: Home -> Start 4P Game -> Deal -> Illegal Meld Rejected -> Undo/Reset -> Legal Icebreaker Play -> AI Turns -> Reload Persistence -> Game End Settlement', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Verify Home Screen
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expect(page.getByText('曜石拉密', { exact: true })).toBeVisible();

    // Open and close Rules Modal
    await page.getByTestId('btn-home-rules').click();
    await expect(page.getByTestId('modal-rules')).toBeVisible();
    await page.getByTestId('btn-close-rules').click();

    // Select 4-player game (3 AI) and start
    await page.getByTestId('home-ai-count-3').click();
    await page.getByTestId('btn-start-game').click();

    // 2. Verify Game Board & Initial Deal (4 players x 14 tiles = 56 dealt, 50 in pool)
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.getByTestId('pool-counter')).toContainText('50');
    await expect(page.getByTestId('rack-tile-count')).toContainText('14 张');

    // 3. Player attempts an illegal play (select 1 tile from rack, put on table, submit)
    const firstRackTile = page.locator('[data-testid="rack-tiles-list"] button').first();
    await firstRackTile.click();
    await page.getByTestId('btn-play-selected-meld').click();

    await expect(page.getByTestId('rack-tile-count')).toContainText('13 张');
    await expect(page.getByTestId('table-meld-0')).toBeVisible();

    // Submit illegal 1-tile meld -> must be rejected with error banner
    await page.getByTestId('btn-submit-turn').click();
    await expect(page.getByTestId('error-banner')).toBeVisible();

    // 4. Undo / Reset Turn restores all 14 tiles back to rack and empties table
    await page.getByTestId('btn-reset-turn').click();
    await expect(page.getByTestId('rack-tile-count')).toContainText('14 张');
    await expect(page.locator('[data-testid^="table-meld-"]')).toHaveCount(0);

    // 5. Inject a deterministic state where Player 0 has a valid 33-point initial meld [Red 11, Blue 11, Black 11] + 1 tile,
    // so we can test legal Icebreaker Play -> AI turns -> Page Reload Recovery -> Victory Settlement
    const customSavePayload = (() => {
      const fullDeck = createDeck();
      const byId = new Map<string, Tile>(fullDeck.map((t) => [t.id, t]));
      const pick = (ids: string[]) => ids.map((id) => byId.get(id)!);

      const p0Hand = pick(['red-11-1', 'blue-11-1', 'black-11-1', 'yellow-3-1']);
      const p1Hand = pick(['red-1-1', 'blue-2-1', 'yellow-4-1']);
      const p2Hand = pick(['red-2-1', 'blue-3-1', 'yellow-5-1']);
      const p3Hand = pick(['red-3-1', 'blue-4-1', 'yellow-6-1']);

      const used = new Set(
        [...p0Hand, ...p1Hand, ...p2Hand, ...p3Hand].map((t) => t.id)
      );
      const remainingPool = fullDeck.filter((t) => !used.has(t.id));

      const gs: GameState = {
        id: 'e2e-test-game',
        status: 'playing',
        config: {
          aiCount: 3,
          aiDifficulty: 'easy',
          soundEnabled: false,
          autoSortRack: 'color',
        },
        players: [
          {
            id: 'player-human',
            name: '你（玩家）',
            type: 'human',
            hand: p0Hand,
            hasInitialMeld: false,
            score: 0,
          },
          {
            id: 'player-2',
            name: '阿尔法 · 智者',
            type: 'ai',
            aiDifficulty: 'easy',
            hand: p1Hand,
            hasInitialMeld: false,
            score: 0,
          },
          {
            id: 'player-3',
            name: '贝塔 · 大师',
            type: 'ai',
            aiDifficulty: 'easy',
            hand: p2Hand,
            hasInitialMeld: false,
            score: 0,
          },
          {
            id: 'player-4',
            name: '伽马 · 策士',
            type: 'ai',
            aiDifficulty: 'easy',
            hand: p3Hand,
            hasInitialMeld: false,
            score: 0,
          },
        ],
        currentPlayerIndex: 0,
        pool: remainingPool,
        table: [],
        turnStartSnapshot: {
          hand: p0Hand,
          table: [],
        },
        undoStack: [],
        turnNumber: 1,
        consecutivePasses: 0,
        winnerId: null,
        endReason: null,
        history: [],
        lastError: null,
        lastActionNotice: '请完成首次破冰出牌',
        recentTileIds: [],
      };

      return {
        version: 2,
        savedAt: Date.now(),
        gameState: gs,
      };
    })();

    await page.evaluate((payload) => {
      window.localStorage.setItem(
        'atelier_rummikub_save_v2',
        JSON.stringify(payload)
      );
    }, customSavePayload);

    // 6. Reload page and verify saved game restoration
    await page.reload();
    await expect(page.getByTestId('saved-game-card')).toBeVisible();
    await page.getByTestId('btn-resume-game').click();

    await expect(page.getByTestId('rack-tile-count')).toContainText('4 张');

    // Select [Red 11, Blue 11, Black 11] (33 pts >= 30) and play to table
    await page.getByTestId('tile-red-11-1').click();
    await page.getByTestId('tile-blue-11-1').click();
    await page.getByTestId('tile-black-11-1').click();
    await page.getByTestId('btn-play-selected-meld').click();

    await expect(page.getByTestId('table-meld-0')).toHaveAttribute(
      'data-meld-valid',
      'true'
    );
    await expect(page.getByTestId('icebreaker-meter')).toContainText('33 / 30 分');

    // Submit valid initial meld
    await page.getByTestId('btn-submit-turn').click();

    // Wait for all 3 AI players to finish their turns (~1.6s total) and return to human player's turn
    await expect(page.getByTestId('player-card-0')).toHaveAttribute(
      'data-active-turn',
      'true',
      { timeout: 8000 }
    );
    await expect(page.getByTestId('player-card-0')).toContainText('已破冰');

    // 7. Now verify Endgame Victory & Settlement Modal
    const winningSavePayload = (() => {
      const fullDeck = createDeck();
      const byId = new Map<string, Tile>(fullDeck.map((t) => [t.id, t]));
      const pick = (ids: string[]) => ids.map((id) => byId.get(id)!);

      const p0Hand = pick(['red-10-1', 'blue-10-1', 'black-10-1']);
      const p1Hand = pick(['yellow-7-1', 'joker-1']); // 37 penalty

      const used = new Set([...p0Hand, ...p1Hand].map((t) => t.id));
      const remainingPool = fullDeck.filter((t) => !used.has(t.id));

      const gs: GameState = {
        id: 'e2e-win-game',
        status: 'playing',
        config: {
          aiCount: 1,
          aiDifficulty: 'easy',
          soundEnabled: false,
          autoSortRack: 'color',
        },
        players: [
          {
            id: 'player-human',
            name: '你（玩家）',
            type: 'human',
            hand: p0Hand,
            hasInitialMeld: true,
            score: 0,
          },
          {
            id: 'player-2',
            name: '阿尔法 · 智者',
            type: 'ai',
            aiDifficulty: 'easy',
            hand: p1Hand,
            hasInitialMeld: true,
            score: 0,
          },
        ],
        currentPlayerIndex: 0,
        pool: remainingPool,
        table: [],
        turnStartSnapshot: {
          hand: p0Hand,
          table: [],
        },
        undoStack: [],
        turnNumber: 8,
        consecutivePasses: 0,
        winnerId: null,
        endReason: null,
        history: [],
        lastError: null,
        lastActionNotice: '打出最后三张手牌即可获胜',
        recentTileIds: [],
      };

      return {
        version: 2,
        savedAt: Date.now(),
        gameState: gs,
      };
    })();

    await page.evaluate((payload) => {
      window.localStorage.setItem(
        'atelier_rummikub_save_v2',
        JSON.stringify(payload)
      );
    }, winningSavePayload);

    await page.reload();
    await page.getByTestId('btn-resume-game').click();

    // Use Smart Hint to stage the winning meld onto the table and submit!
    await page.getByTestId('btn-smart-hint').click();
    await expect(page.getByTestId('rack-tile-count')).toContainText('0 张');
    await page.getByTestId('btn-submit-turn').click();

    // Settlement modal appears with exact scores (+37 for winner, -37 for AI with 7 + Joker(30))
    await expect(page.getByTestId('modal-settlement')).toBeVisible();
    await expect(page.getByTestId('settlement-winner-title')).toContainText(
      '你（玩家） 赢得对局胜利'
    );
    await expect(page.getByTestId('settlement-score-player-human')).toContainText(
      '+37 分'
    );
    await expect(page.getByTestId('settlement-score-player-2')).toContainText(
      '-37 分'
    );
  });

  test('2. Online Multiplayer Room flow: Create Room -> Generate Invite Code -> Start Authoritative Room Match', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('btn-open-multiplayer').click();
    await expect(page.getByTestId('multiplayer-lobby')).toBeVisible();

    await page.getByTestId('input-mp-name').fill('测试房主');
    await page.getByTestId('btn-create-room').click();

    const roomCodeEl = page.getByTestId('mp-room-code');
    await expect(roomCodeEl).toBeVisible();
    const codeText = await roomCodeEl.textContent();
    expect(codeText?.trim().length).toBe(6);

    // Test renaming player inside the room lobby
    await page.getByTestId('input-mp-rename').fill('曜石大宗师');
    await page.getByTestId('btn-mp-rename').click();
    await expect(page.getByText('曜石大宗师')).toBeVisible();

    await page.getByTestId('btn-mp-start-game').click();
    await expect(page.getByTestId('game-board')).toBeVisible();
    await expect(page.getByTestId('rack-tile-count')).toContainText('14 张');
  });
});
