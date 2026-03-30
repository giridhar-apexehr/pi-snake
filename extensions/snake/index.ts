import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import SnakeEngine from "@dip-in-milk/snake";

type Direction = "up" | "down" | "left" | "right";
type Point = { x: number; y: number };

type SnakeLib = {
	Game: new (width: number, height: number) => {
		world: { width: number; height: number };
		gameObjects: Array<{ sprite: { pixels: Point[] } }>;
	};
	Player: new (game: unknown) => {
		gameObject: { direction: [number, number]; sprite: { pixels: Point[] } };
		getControls: () => Array<{ label: "up" | "down" | "left" | "right"; method: () => void }>;
	};
	Fruit: new (game: unknown) => { sprite: { pixels: Point[] } };
};

const lib = SnakeEngine as unknown as SnakeLib;

const BASE_WIDTH = 26;
const BASE_HEIGHT = 16;
const TICK_MS = 120;
const SAVE_TYPE = "snake-overlay-save";

interface SavedState {
	highScore: number;
}

class SnakeAdapter {
	private readonly game: InstanceType<SnakeLib["Game"]>;
	private readonly player: InstanceType<SnakeLib["Player"]>;
	private readonly controls: Record<Direction, () => void>;
	private fruits: Array<InstanceType<SnakeLib["Fruit"]>> = [];
	private score = 0;
	private gameOver = false;
	private initializedDirection = false;

	constructor(private readonly worldWidth: number, private readonly worldHeight: number) {
		this.game = new lib.Game(worldWidth, worldHeight);
		this.player = new lib.Player(this.game);
		this.controls = this.player
			.getControls()
			.reduce<Record<Direction, () => void>>((acc, control) => {
				acc[control.label] = control.method;
				return acc;
			}, { up: () => undefined, down: () => undefined, left: () => undefined, right: () => undefined });
		this.controls.right();
		this.initializedDirection = true;
		this.spawnFruit();
	}

	setDirection(direction: Direction): void {
		if (this.gameOver) return;
		const [dx, dy] = this.player.gameObject.direction;
		const opposite =
			(direction === "up" && dy === 1) ||
			(direction === "down" && dy === -1) ||
			(direction === "left" && dx === 1) ||
			(direction === "right" && dx === -1);
		if (opposite) return;
		this.controls[direction]();
	}

	step(): void {
		if (this.gameOver) return;
		const snake = this.player.gameObject.sprite.pixels;
		const head = snake[0];
		if (!head) {
			this.gameOver = true;
			return;
		}
		const [dx, dy] = this.player.gameObject.direction;
		if (!this.initializedDirection || (dx === 0 && dy === 0)) {
			return;
		}

		const nextHead = { x: head.x + dx, y: head.y + dy };

		if (nextHead.x < 0 || nextHead.x >= this.worldWidth || nextHead.y < 0 || nextHead.y >= this.worldHeight) {
			this.gameOver = true;
			return;
		}

		if (snake.slice(1).some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)) {
			this.gameOver = true;
			return;
		}

		snake.unshift(nextHead);
		const ateFruit = this.consumeFruitAt(nextHead);
		if (ateFruit) {
			this.score += 10;
			this.spawnFruit();
		} else {
			snake.pop();
		}
	}

	isGameOver(): boolean {
		return this.gameOver;
	}

	getScore(): number {
		return this.score;
	}

	getSnake(): Point[] {
		return this.player.gameObject.sprite.pixels;
	}

	getFruit(): Point | undefined {
		for (const fruit of this.fruits) {
			const pixel = fruit.sprite.pixels[0];
			if (pixel) return pixel;
		}
		return undefined;
	}

	private consumeFruitAt(head: Point): boolean {
		for (let i = 0; i < this.fruits.length; i++) {
			const fruit = this.fruits[i];
			const pixel = fruit?.sprite.pixels[0];
			if (!pixel) continue;
			if (pixel.x === head.x && pixel.y === head.y) {
				fruit.sprite.pixels = [];
				this.fruits.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	private spawnFruit(): void {
		let fruit: InstanceType<SnakeLib["Fruit"]>;
		do {
			fruit = new lib.Fruit(this.game);
		} while (
			this.getSnake().some((segment) => {
				const pixel = fruit.sprite.pixels[0];
				return Boolean(pixel && pixel.x === segment.x && pixel.y === segment.y);
			})
		);
		this.fruits.push(fruit);
	}
}

class SnakeOverlayComponent {
	private adapter = new SnakeAdapter(BASE_WIDTH, BASE_HEIGHT);
	private interval: ReturnType<typeof setInterval> | null = null;
	private paused = false;
	private score = 0;
	private highScore: number;

	constructor(
		private readonly tui: { requestRender: () => void },
		private readonly theme: Theme,
		private readonly onDone: (result: SavedState) => void,
		savedState?: SavedState,
	) {
		this.highScore = savedState?.highScore ?? 0;
		this.interval = setInterval(() => {
			if (!this.paused && !this.adapter.isGameOver()) {
				this.adapter.step();
				this.score = this.adapter.getScore();
				this.highScore = Math.max(this.highScore, this.score);
			}
			this.tui.requestRender();
		}, TICK_MS);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || data === "q" || data === "Q") {
			this.dispose();
			this.onDone({ highScore: this.highScore });
			return;
		}

		if (matchesKey(data, "p") || data === "P") {
			if (!this.adapter.isGameOver()) this.paused = !this.paused;
			this.tui.requestRender();
			return;
		}

		if (this.adapter.isGameOver()) {
			if (matchesKey(data, "return") || data === " ") {
				this.restart();
				this.tui.requestRender();
			}
			return;
		}

		const mapDirection = this.mapInputToDirection(data);
		if (mapDirection) {
			this.adapter.setDirection(mapDirection);
		}
	}

	render(width: number): string[] {
		const dim = (s: string) => this.theme.fg("dim", s);
		const accent = (s: string) => this.theme.fg("accent", s);
		const success = (s: string) => this.theme.fg("success", s);
		const error = (s: string) => this.theme.fg("error", s);

		const cellW = 2;
		const maxGridWidth = Math.max(10, Math.min(BASE_WIDTH, Math.floor((width - 8) / cellW)));
		const maxGridHeight = Math.max(8, Math.min(BASE_HEIGHT, Math.floor((maxGridWidth / BASE_WIDTH) * BASE_HEIGHT)));
		const gridW = maxGridWidth * cellW;
		const totalW = gridW + 2;
		const top = `╭${"─".repeat(totalW)}╮`;
		const bottom = `╰${"─".repeat(totalW)}╯`;
		const snake = this.adapter.getSnake();
		const fruit = this.adapter.getFruit();
		const lines: string[] = [];

		const fit = (text: string) => {
			const len = visibleWidth(text);
			return text + " ".repeat(Math.max(0, totalW - len));
		};

		lines.push(dim(top));
		lines.push(dim("│") + fit(`${accent("Snake")}`) + dim("│"));
		lines.push(dim("│") + fit(`Score ${success(String(this.score))}  High ${success(String(this.highScore))}`) + dim("│"));
		lines.push(dim(`├${"─".repeat(totalW)}┤`));

		for (let y = 0; y < maxGridHeight; y++) {
			let row = "";
			for (let x = 0; x < maxGridWidth; x++) {
				const sx = Math.floor((x / maxGridWidth) * BASE_WIDTH);
				const sy = Math.floor((y / maxGridHeight) * BASE_HEIGHT);
				const head = snake[0];
				const isHead = Boolean(head && head.x === sx && head.y === sy);
				const isBody = snake.slice(1).some((segment) => segment.x === sx && segment.y === sy);
				const isFruit = Boolean(fruit && fruit.x === sx && fruit.y === sy);
				if (isHead) row += success("██");
				else if (isBody) row += success("▓▓");
				else if (isFruit) row += error("◆ ");
				else row += "  ";
			}
			lines.push(dim("│") + row + dim("│"));
		}

		lines.push(dim(`├${"─".repeat(totalW)}┤`));
		const footer = this.adapter.isGameOver()
			? `${error("Game over")}: Enter/Space restart • Esc/Q close`
			: this.paused
				? `${accent("Paused")}: P resume • Esc/Q close`
				: "Move: ↑↓←→ / WASD / IJKL • P pause • Esc/Q close";
		lines.push(dim("│") + fit(footer) + dim("│"));
		lines.push(dim(bottom));

		return lines;
	}

	invalidate(): void {
		// noop
	}

	dispose(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	private restart(): void {
		this.adapter = new SnakeAdapter(BASE_WIDTH, BASE_HEIGHT);
		this.paused = false;
		this.score = 0;
	}

	private mapInputToDirection(data: string): Direction | undefined {
		if (matchesKey(data, "up") || data === "w" || data === "W" || data === "i" || data === "I") return "up";
		if (matchesKey(data, "down") || data === "s" || data === "S" || data === "k" || data === "K") return "down";
		if (matchesKey(data, "left") || data === "a" || data === "A" || data === "j" || data === "J") return "left";
		if (matchesKey(data, "right") || data === "d" || data === "D" || data === "l" || data === "L") return "right";
		return undefined;
	}
}

export default function snakeExtension(pi: ExtensionAPI): void {
	pi.registerCommand("snake", {
		description: "Play snake in a centered overlay",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/snake requires interactive mode", "error");
				return;
			}

			let savedState: SavedState | undefined;
			for (const entry of [...ctx.sessionManager.getEntries()].reverse()) {
				if (entry.type === "custom" && entry.customType === SAVE_TYPE) {
					savedState = (entry.data as SavedState | undefined) ?? undefined;
					break;
				}
			}

			await ctx.ui.custom<void>(
				(tui, theme, _keybindings, done) =>
					new SnakeOverlayComponent(tui, theme, (state) => {
						pi.appendEntry(SAVE_TYPE, state);
						done(undefined);
					}, savedState),
				{
					overlay: true,
					overlayOptions: { anchor: "center", width: 72, maxHeight: 28 },
				},
			);
		},
	});
}
