import Phaser from 'phaser';
import {
  type FullscreenStatus,
  type OrientationStatus,
  createInitialInputDebugState,
  setInputDebugState,
} from './inputState';
import { GAME_WIDTH } from '../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';

const JOYSTICK_LEFT_BOUNDARY = 400;
const INTERACT_RIGHT_BOUNDARY = 880;
const JOYSTICK_RADIUS = 80;
const JOYSTICK_BASE_X = 200;
const JOYSTICK_BASE_Y = 600;
const DIALOGUE_TAP_LEFT = 280;
const DIALOGUE_TAP_RIGHT = 1000;
const DIALOGUE_TAP_TOP = 560;
const DIALOGUE_TAP_BOTTOM = 710;
const MOBILE_INTERACT_DEBOUNCE_MS = 120;

const MOBILE_CONTROL_DEPTH = 950;
const MOBILE_THUMB_DEPTH = 951;
const FULLSCREEN_DEPTH = 990;
const FULLSCREEN_BTN_DEPTH = 991;
const FULLSCREEN_LABEL_DEPTH = 992;
const TUTORIAL_DEPTH = 993;
const TUTORIAL_TEXT_DEPTH = 994;
const ORIENTATION_DEPTH = 1010;
const ORIENTATION_TEXT_DEPTH = 1011;
const INPUT_TUTORIAL_STORAGE_PREFIX = 'ying-zhong-jiu.input-tutorial-shown.v1';
const INPUT_TUTORIAL_DURATION_MS = 3_000;

const DIRECTION_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

function quantizeTo8Directions(angle: number): { x: number; y: number } {
  const normalized = ((angle % 360) + 360) % 360;
  let closestAngle = 0;
  let minDiff = Infinity;

  for (const a of DIRECTION_ANGLES) {
    let diff = Math.abs(normalized - a);
    if (diff > 180) diff = 360 - diff;
    if (diff < minDiff) {
      minDiff = diff;
      closestAngle = a;
    }
  }

  const cos = Math.cos(Phaser.Math.DegToRad(closestAngle));
  const sin = Math.sin(Phaser.Math.DegToRad(closestAngle));
  const x = Math.abs(cos) < 0.3 ? 0 : cos > 0 ? 1 : -1;
  const y = Math.abs(sin) < 0.3 ? 0 : sin > 0 ? -1 : 1;
  return { x, y };
}

export type InputLockReason =
  | 'dialogue'
  | 'rolePrompt'
  | 'blackScreen'
  | 'elevatorFade'
  | 'scriptedMovement'
  | 'ending';

export class InputManager {
  private scene: Phaser.Scene;
  private locked = false;
  private lockReason: string | null = null;
  private movementVector: { x: number; y: number } = { x: 0, y: 0 };

  // Desktop
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyUp!: Phaser.Input.Keyboard.Key;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyDown!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyFPrevDown = false;
  private keyQPrevDown = false;

  // Mobile
  private isMobile: boolean;
  private joystickPointerId: number | null = null;
  private joystickStartX = 0;
  private joystickStartY = 0;

  // Interact
  private interactAction: string | null = null;
  private interactPressedThisFrame = false;
  private contextAction: 'F' | 'Q' | null = null;
  private lastMobileInteractAt = 0;

  // Fullscreen
  private fullscreenStatus: FullscreenStatus = 'idle';
  private fullscreenAvailable = true;
  private fullscreenFallbackTimeout: ReturnType<typeof setTimeout> | null = null;

  // Orientation
  private orientationStatus: OrientationStatus = 'landscape';

  // UI elements
  private joystickThumb: Phaser.GameObjects.Arc | null = null;
  private joystickBase: Phaser.GameObjects.Arc | null = null;
  private interactButton: Phaser.GameObjects.Arc | null = null;
  private interactLabel: Phaser.GameObjects.Text | null = null;
  private fullscreenOverlay: Phaser.GameObjects.Rectangle | null = null;
  private fullscreenButton: Phaser.GameObjects.Rectangle | null = null;
  private fullscreenButtonLabel: Phaser.GameObjects.Text | null = null;
  private fullscreenLabel: Phaser.GameObjects.Text | null = null;
  private fullscreenDismissBtn: Phaser.GameObjects.Rectangle | null = null;
  private fullscreenDismissLabel: Phaser.GameObjects.Text | null = null;
  private fullscreenReentryBtn: Phaser.GameObjects.Rectangle | null = null;
  private fullscreenReentryLabel: Phaser.GameObjects.Text | null = null;
  private orientationOverlay: Phaser.GameObjects.Rectangle | null = null;
  private orientationText: Phaser.GameObjects.Text | null = null;
  private tutorialOverlay: Phaser.GameObjects.Rectangle | null = null;
  private tutorialText: Phaser.GameObjects.Text | null = null;
  private tutorialHideTimeout: ReturnType<typeof setTimeout> | null = null;

  // Cleanup bindings
  private boundVisibilityChange: (() => void) | null = null;
  private boundGameBlur: (() => void) | null = null;
  private boundFullscreenError: (() => void) | null = null;
  private boundFullscreenChange: (() => void) | null = null;
  private boundEnterFullscreen: (() => void) | null = null;
  private boundLeaveFullscreen: (() => void) | null = null;
  private boundOrientationChange: ((orientation: string) => void) | null = null;
  private boundTouchStart: ((e: TouchEvent) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isMobile = scene.sys.game.device.input.touch;

    this.setupDesktopKeyboard();
    this.initDebugState();

    if (this.isMobile) {
      this.setupMobileControls();
      this.setupFullscreenPrompt();
      this.setupOrientationHandling();
      this.setupCleanupListeners();
    } else {
      this.setupDesktopPointerInput();
    }

    this.setupInputTutorial();

    this.updateDebugState();
  }

  // ── Public API ──────────────────────────────────────────────

  getMovementVector(): { x: number; y: number } {
    if (this.locked) return { x: 0, y: 0 };
    return { x: this.movementVector.x, y: this.movementVector.y };
  }

  consumeInteract(): { action: string | null; pressed: boolean } {
    if (this.locked && !this.allowsLockedInteract()) {
      return { action: null, pressed: false };
    }
    const result = { action: this.interactAction, pressed: this.interactPressedThisFrame };
    // Clear after consumption so one-shot taps don't persist across frames
    this.interactAction = null;
    this.interactPressedThisFrame = false;
    return result;
  }

  lock(reason: InputLockReason): void {
    this.locked = true;
    this.lockReason = reason;
    this.movementVector = { x: 0, y: 0 };
    this.interactAction = null;
    this.interactPressedThisFrame = false;
    this.keyFPrevDown = this.keyF.isDown;
    this.keyQPrevDown = this.keyQ.isDown;

    if (this.joystickPointerId !== null) {
      this.joystickPointerId = null;
      if (this.joystickThumb) {
        this.joystickThumb.setPosition(this.joystickStartX, this.joystickStartY);
      }
    }

    this.updateDebugState();
  }

  unlock(): void {
    this.locked = false;
    this.lockReason = null;
    this.updateDebugState();
  }

  isLocked(): boolean {
    return this.locked;
  }

  getLockReason(): string | null {
    return this.lockReason;
  }

  setInteractContext(action: 'F' | 'Q' | null): void {
    this.contextAction = action;
  }

  isOnMobile(): boolean {
    return this.isMobile;
  }

  getFullscreenStatus(): FullscreenStatus {
    return this.fullscreenStatus;
  }

  getOrientationStatus(): OrientationStatus {
    return this.orientationStatus;
  }

  // ── Update ──────────────────────────────────────────────────

  update(): void {
    if (!this.isMobile) {
      this.pollDesktopKeyboard();
    }
    this.updateDebugState();
  }

  // ── Desktop Keyboard ───────────────────────────────────────

  private setupDesktopKeyboard(): void {
    if (!this.scene.input.keyboard) return;

    const keyboard = this.scene.input.keyboard;

    keyboard.addCapture([
      'UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE',
      'W', 'A', 'S', 'D', 'F', 'Q',
    ]);

    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W, true, false);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A, true, false);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S, true, false);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D, true, false);
    this.keyUp = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP, true, false);
    this.keyLeft = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT, true, false);
    this.keyDown = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN, true, false);
    this.keyRight = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT, true, false);
    this.keyF = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F, true, false);
    this.keyQ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q, true, false);
  }

  private setupDesktopPointerInput(): void {
    this.scene.input.on('pointerdown', this.onDesktopPointerDown, this);
  }

  private onDesktopPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isDialogueTap(pointer)) return;
    this.interactPressedThisFrame = true;
    this.interactAction = this.contextAction ?? 'F';
  }

  private pollDesktopKeyboard(): void {
    if (this.locked) {
      this.movementVector = { x: 0, y: 0 };
      this.pollInteractKeys(this.allowsLockedInteract());
      return;
    }

    // Movement vector from WASD + arrows
    let dx = 0;
    let dy = 0;

    if (this.keyD.isDown || this.keyRight.isDown) dx += 1;
    if (this.keyA.isDown || this.keyLeft.isDown) dx -= 1;
    if (this.keyS.isDown || this.keyDown.isDown) dy += 1;
    if (this.keyW.isDown || this.keyUp.isDown) dy -= 1;

    // Clamp
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));

    this.movementVector = { x: dx, y: dy };

    this.pollInteractKeys(true);
  }

  private pollInteractKeys(allowInteract: boolean): void {
    const fDown = this.keyF.isDown;
    const qDown = this.keyQ.isDown;

    if (allowInteract && fDown && !this.keyFPrevDown) {
      this.interactPressedThisFrame = true;
      this.interactAction = 'F';
    } else if (allowInteract && qDown && !this.keyQPrevDown) {
      this.interactPressedThisFrame = true;
      this.interactAction = 'Q';
    }

    this.keyFPrevDown = fDown;
    this.keyQPrevDown = qDown;
  }

  private allowsLockedInteract(): boolean {
    return this.lockReason === 'dialogue';
  }

  // ── Mobile Controls ────────────────────────────────────────

  private setupMobileControls(): void {
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
    this.scene.input.on('pointerupoutside', this.onPointerUp, this);

    // Direct touchstart listener for reliable mobile taps (S5)
    // Phaser's pointer system may not reliably convert raw TouchEvents
    // dispatched on the canvas for repeated taps with sequential identifiers.
    const canvas = this.scene.sys.game.canvas;
    if (canvas) {
      this.boundTouchStart = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = 1280 / rect.width;
        const scaleY = 720 / rect.height;
        const gameX = (touch.clientX - rect.left) * scaleX;
        const gameY = (touch.clientY - rect.top) * scaleY;
        if (this.isDialogueTapAt(gameX, gameY)) {
          this.pressMobileInteract();
        } else if (gameX > INTERACT_RIGHT_BOUNDARY && (this.locked ? this.allowsLockedInteract() : true)) {
          this.pressMobileInteract();
        }
      };
      canvas.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    }

    // Joystick visual
    this.joystickBase = this.scene.add.circle(
      JOYSTICK_BASE_X, JOYSTICK_BASE_Y, JOYSTICK_RADIUS,
      UI_THEME.colors.surfaceMuted, UI_THEME.alpha.control,
    ).setDepth(MOBILE_CONTROL_DEPTH).setScrollFactor(0).setVisible(false);
    applyPixelStrokeStyle(this.joystickBase, UI_THEME.stroke.medium, UI_THEME.colors.borderMuted, 0.9);

    this.joystickThumb = this.scene.add.circle(
      JOYSTICK_BASE_X, JOYSTICK_BASE_Y, 28,
      UI_THEME.colors.gold, UI_THEME.alpha.controlActive,
    ).setDepth(MOBILE_THUMB_DEPTH).setScrollFactor(0).setVisible(false);
    applyPixelStrokeStyle(this.joystickThumb, UI_THEME.stroke.thin, UI_THEME.colors.surface, 0.9);

    this.interactButton = null;
    this.interactLabel = null;
  }

  private setupInputTutorial(): void {
    if (this.hasSeenInputTutorial()) return;

    const text = this.isMobile
      ? '左侧滑动移动，右侧任意位置轻点互动'
      : 'WASD/方向键移动，F互动，Q特殊互动';
    this.tutorialOverlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, 112, 760, 76, UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panelStrong,
    ).setOrigin(0.5).setScrollFactor(0).setDepth(TUTORIAL_DEPTH);
    applyPixelStrokeStyle(this.tutorialOverlay, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);

    this.tutorialText = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, 112, text,
      { align: 'center', color: UI_THEME.colors.textGold, fontFamily: UI_THEME.font.ui, fontSize: '22px', fontStyle: 'bold' },
    )).setOrigin(0.5).setScrollFactor(0).setDepth(TUTORIAL_TEXT_DEPTH);

    this.markInputTutorialSeen();
    this.tutorialHideTimeout = setTimeout(() => {
      this.tutorialHideTimeout = null;
      this.hideInputTutorial();
    }, INPUT_TUTORIAL_DURATION_MS);
  }

  private hasSeenInputTutorial(): boolean {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(this.inputTutorialStorageKey()) === 'true';
  }

  private markInputTutorialSeen(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.inputTutorialStorageKey(), 'true');
  }

  private inputTutorialStorageKey(): string {
    return `${INPUT_TUTORIAL_STORAGE_PREFIX}.${this.isMobile ? 'mobile' : 'desktop'}`;
  }

  private hideInputTutorial(): void {
    this.tutorialOverlay?.setVisible(false);
    this.tutorialText?.setVisible(false);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isDialogueTap(pointer)) {
      this.pressMobileInteract();
    } else if (pointer.x < JOYSTICK_LEFT_BOUNDARY) {
      // Joystick region
      if (this.joystickPointerId === null && !this.locked) {
        this.joystickPointerId = pointer.id;
        this.joystickStartX = pointer.x;
        this.joystickStartY = pointer.y;
        this.joystickBase?.setFillStyle(UI_THEME.colors.borderMuted, UI_THEME.alpha.controlActive);
      }
    } else if (pointer.x > INTERACT_RIGHT_BOUNDARY) {
      // Interact region
      if (!this.locked || this.allowsLockedInteract()) {
        this.pressMobileInteract();
      }
    }
  }

  private pressMobileInteract(): void {
    const now = Date.now();
    if (this.lastMobileInteractAt === undefined) {
      this.lastMobileInteractAt = -Infinity;
    }
    if (now - this.lastMobileInteractAt < MOBILE_INTERACT_DEBOUNCE_MS) return;

    this.lastMobileInteractAt = now;
    this.interactButton?.setFillStyle(UI_THEME.colors.accentPressed, UI_THEME.alpha.controlActive);
    this.interactPressedThisFrame = true;
    this.interactAction = this.contextAction ?? 'F';
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.locked) return;
    if (pointer.id !== this.joystickPointerId) return;

    const dx = pointer.x - this.joystickStartX;
    const dy = pointer.y - this.joystickStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(distance, JOYSTICK_RADIUS);

    if (distance < 4) {
      this.movementVector = { x: 0, y: 0 };
      if (this.joystickThumb) {
        this.joystickThumb.setPosition(this.joystickStartX, this.joystickStartY);
      }
      return;
    }

    const angle = Phaser.Math.RadToDeg(Math.atan2(-dy, dx));
    const quantized = quantizeTo8Directions(angle);
    this.movementVector = quantized;

    const ratio = clampedDist / distance;
    const thumbX = this.joystickStartX + dx * ratio;
    const thumbY = this.joystickStartY + dy * ratio;

    if (this.joystickThumb) {
      this.joystickThumb.setPosition(thumbX, thumbY);
    }
  }

  private isDialogueTap(pointer: Phaser.Input.Pointer): boolean {
    if (!this.locked || !this.allowsLockedInteract()) return false;
    return this.isDialogueTapAt(pointer.x, pointer.y);
  }

  private isDialogueTapAt(x: number, y: number): boolean {
    if (!this.locked || !this.allowsLockedInteract()) return false;
    return x >= DIALOGUE_TAP_LEFT &&
      x <= DIALOGUE_TAP_RIGHT &&
      y >= DIALOGUE_TAP_TOP &&
      y <= DIALOGUE_TAP_BOTTOM;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joystickPointerId) {
      this.resetJoystick();
    }

    this.interactButton?.setFillStyle(UI_THEME.colors.accent, UI_THEME.alpha.controlActive);
  }

  private resetJoystick(): void {
    this.joystickPointerId = null;
    this.movementVector = { x: 0, y: 0 };
    if (this.joystickThumb) {
      this.joystickThumb.setPosition(this.joystickStartX, this.joystickStartY);
    }
    this.joystickBase?.setFillStyle(UI_THEME.colors.surfaceMuted, UI_THEME.alpha.control);
    this.interactButton?.setFillStyle(UI_THEME.colors.accent, UI_THEME.alpha.controlActive);
    this.updateDebugState();
  }

  // ── Fullscreen ──────────────────────────────────────────────

  private setupFullscreenPrompt(): void {
    // Check if fullscreen API is available
    if (typeof document !== 'undefined') {
      if (!document.fullscreenEnabled) {
        this.fullscreenAvailable = false;
        this.fullscreenStatus = 'unsupported';
        this.updateDebugState();
        return;
      }
      if (document.fullscreenElement) {
        this.fullscreenStatus = 'entered';
      }
    }

    // ── Big prompt overlay (shown on entry, positioned at top to avoid start button) ──
    this.fullscreenOverlay = this.scene.add.rectangle(
      640, 82, 680, 92, UI_THEME.colors.surface, UI_THEME.alpha.panelStrong,
    ).setDepth(FULLSCREEN_DEPTH).setScrollFactor(0);
    applyPixelStrokeStyle(this.fullscreenOverlay, UI_THEME.stroke.medium, UI_THEME.colors.border, 0.95);

    this.fullscreenLabel = applyPixelTextStyle(this.scene.add.text(
      640, 58, '建议进入全屏模式',
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '21px', fontStyle: 'bold' },
    )).setOrigin(0.5).setDepth(FULLSCREEN_LABEL_DEPTH).setScrollFactor(0);

    // "全屏" accept button
    this.fullscreenButton = this.scene.add.rectangle(
      520, 104, 160, 44, UI_THEME.colors.accent,
    ).setDepth(FULLSCREEN_BTN_DEPTH).setScrollFactor(0).setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(this.fullscreenButton, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);

    this.fullscreenButtonLabel = applyPixelTextStyle(this.scene.add.text(
      520, 104, '全屏',
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '21px', fontStyle: 'bold' },
    )).setOrigin(0.5).setDepth(FULLSCREEN_LABEL_DEPTH).setScrollFactor(0);

    // "暂不" dismiss button
    this.fullscreenDismissBtn = this.scene.add.rectangle(
      760, 104, 160, 44, UI_THEME.colors.surfaceMuted,
    ).setDepth(FULLSCREEN_BTN_DEPTH).setScrollFactor(0).setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(this.fullscreenDismissBtn, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);

    this.fullscreenDismissLabel = applyPixelTextStyle(this.scene.add.text(
      760, 104, '暂不',
      { align: 'center', color: UI_THEME.colors.textMuted, fontFamily: UI_THEME.font.ui, fontSize: '19px' },
    )).setOrigin(0.5).setDepth(FULLSCREEN_LABEL_DEPTH).setScrollFactor(0);

    // ── Small re-entry button (shown after dismissal) ─────────
    this.fullscreenReentryBtn = this.scene.add.rectangle(
      1240, 30, 68, 34, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.control,
    ).setDepth(FULLSCREEN_BTN_DEPTH).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    this.fullscreenReentryLabel = applyPixelTextStyle(this.scene.add.text(
      1240, 30, '全屏',
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' },
    )).setOrigin(0.5).setDepth(FULLSCREEN_LABEL_DEPTH).setScrollFactor(0).setVisible(false);

    // ── Button handlers ──────────────────────────────────────
    this.fullscreenButton.on('pointerup', () => {
      this.fullscreenButton?.setFillStyle(UI_THEME.colors.accentHover);
      this.attemptFullscreen();
    });
    this.fullscreenButton.on('pointerover', () => this.fullscreenButton?.setFillStyle(UI_THEME.colors.accentHover));
    this.fullscreenButton.on('pointerout', () => this.fullscreenButton?.setFillStyle(UI_THEME.colors.accent));
    this.fullscreenButton.on('pointerdown', () => this.fullscreenButton?.setFillStyle(UI_THEME.colors.accentPressed));

    this.fullscreenDismissBtn.on('pointerup', () => {
      this.fullscreenDismissBtn?.setFillStyle(UI_THEME.colors.surfaceMuted);
      this.dismissFullscreenPrompt();
    });
    this.fullscreenDismissBtn.on('pointerover', () => this.fullscreenDismissBtn?.setFillStyle(UI_THEME.colors.borderMuted));
    this.fullscreenDismissBtn.on('pointerout', () => this.fullscreenDismissBtn?.setFillStyle(UI_THEME.colors.surfaceMuted));
    this.fullscreenDismissBtn.on('pointerdown', () => this.fullscreenDismissBtn?.setFillStyle(UI_THEME.colors.surface));

    this.fullscreenReentryBtn.on('pointerup', () => {
      this.attemptFullscreen();
    });

    // ── Fullscreen events ────────────────────────────────────
    this.boundEnterFullscreen = () => {
      this.fullscreenStatus = 'entered';
      this.clearFullscreenFallbackTimeout();
      this.hideAllFullscreenPrompts();
      this.updateDebugState();
    };
    this.scene.scale.on('enterfullscreen', this.boundEnterFullscreen);

    this.boundLeaveFullscreen = () => {
      this.fullscreenStatus = 'left';
      this.clearFullscreenFallbackTimeout();
      this.showMainFullscreenPrompt();
      this.updateDebugState();
    };
    this.scene.scale.on('leavefullscreen', this.boundLeaveFullscreen);

    if (typeof document !== 'undefined') {
      this.boundFullscreenChange = () => {
        this.syncFullscreenFromDocument();
      };
      document.addEventListener('fullscreenchange', this.boundFullscreenChange);

      this.boundFullscreenError = () => {
        if (this.fullscreenStatus === 'requested') {
          this.fullscreenStatus = 'denied';
          this.clearFullscreenFallbackTimeout();
          this.dismissFullscreenPrompt();
          this.updateDebugState();
        }
      };
      document.addEventListener('fullscreenerror', this.boundFullscreenError);
    }

    this.syncFullscreenFromDocument();
  }

  private syncFullscreenFromDocument(): void {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      this.fullscreenStatus = 'entered';
      this.clearFullscreenFallbackTimeout();
      this.hideAllFullscreenPrompts();
      this.updateDebugState();
      return;
    }
    if (this.fullscreenStatus === 'entered' || this.fullscreenStatus === 'requested') {
      this.fullscreenStatus = 'left';
      this.clearFullscreenFallbackTimeout();
      this.showMainFullscreenPrompt();
      this.updateDebugState();
    }
  }

  private isDocumentFullscreen(): boolean {
    return typeof document !== 'undefined' && document.fullscreenElement !== null;
  }

  private attemptFullscreen(): void {
    this.syncFullscreenFromDocument();
    if (this.fullscreenStatus === 'entered') return;
    if (this.fullscreenStatus === 'requested') return;
    if (!this.fullscreenAvailable) return;

    this.fullscreenStatus = 'requested';
    this.hideMainFullscreenPrompt();
    this.updateDebugState();

    try {
      this.scene.scale.startFullscreen();
      // Fallback: if after 800ms we're still 'requested' (not 'entered' and not errored),
      // the browser likely denied it silently
      this.clearFullscreenFallbackTimeout();
      this.fullscreenFallbackTimeout = setTimeout(() => {
        this.fullscreenFallbackTimeout = null;
        if (this.fullscreenStatus === 'requested') {
          this.fullscreenStatus = 'denied';
          this.dismissFullscreenPrompt();
          this.updateDebugState();
        }
      }, 800);
    } catch {
      this.fullscreenStatus = 'unsupported';
      this.dismissFullscreenPrompt();
      this.updateDebugState();
    }
  }

  private clearFullscreenFallbackTimeout(): void {
    if (this.fullscreenFallbackTimeout === null) return;
    clearTimeout(this.fullscreenFallbackTimeout);
    this.fullscreenFallbackTimeout = null;
  }

  private dismissFullscreenPrompt(): void {
    if (this.fullscreenStatus === 'idle' || this.fullscreenStatus === 'requested') {
      this.fullscreenStatus = 'denied';
    }
    this.hideMainFullscreenPrompt();
    this.showFullscreenReentry();
    this.updateDebugState();
  }

  private hideMainFullscreenPrompt(): void {
    if (this.fullscreenOverlay) this.fullscreenOverlay.setVisible(false);
    if (this.fullscreenButton) this.fullscreenButton.setVisible(false);
    if (this.fullscreenButtonLabel) this.fullscreenButtonLabel.setVisible(false);
    if (this.fullscreenLabel) this.fullscreenLabel.setVisible(false);
    if (this.fullscreenDismissBtn) this.fullscreenDismissBtn.setVisible(false);
    if (this.fullscreenDismissLabel) this.fullscreenDismissLabel.setVisible(false);
  }

  private showMainFullscreenPrompt(): void {
    if (this.fullscreenOverlay) this.fullscreenOverlay.setVisible(true);
    if (this.fullscreenButton) this.fullscreenButton.setVisible(true);
    if (this.fullscreenButtonLabel) this.fullscreenButtonLabel.setVisible(true);
    if (this.fullscreenLabel) this.fullscreenLabel.setVisible(true);
    if (this.fullscreenDismissBtn) this.fullscreenDismissBtn.setVisible(true);
    if (this.fullscreenDismissLabel) this.fullscreenDismissLabel.setVisible(true);
    if (this.fullscreenReentryBtn) this.fullscreenReentryBtn.setVisible(false);
    if (this.fullscreenReentryLabel) this.fullscreenReentryLabel.setVisible(false);
  }

  private hideAllFullscreenPrompts(): void {
    this.hideMainFullscreenPrompt();
    if (this.fullscreenReentryBtn) this.fullscreenReentryBtn.setVisible(false);
    if (this.fullscreenReentryLabel) this.fullscreenReentryLabel.setVisible(false);
  }

  private showFullscreenReentry(): void {
    if (!this.fullscreenAvailable) return;
    if (this.fullscreenStatus === 'entered') return;
    if (this.fullscreenReentryBtn) this.fullscreenReentryBtn.setVisible(true);
    if (this.fullscreenReentryLabel) this.fullscreenReentryLabel.setVisible(true);
  }

  // ── Orientation ─────────────────────────────────────────────

  private setupOrientationHandling(): void {
    this.orientationStatus = this.scene.scale.isPortrait ? 'portrait' : 'landscape';

    // Full-canvas opaque overlay for portrait warning
    this.orientationOverlay = this.scene.add.rectangle(
      640, 360, 1280, 720, UI_THEME.colors.surface, 0.92,
    ).setDepth(ORIENTATION_DEPTH).setScrollFactor(0).setVisible(false);

    this.orientationText = applyPixelTextStyle(this.scene.add.text(
      640, 360, '请旋转设备至横屏',
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '32px', fontStyle: 'bold' },
    )).setOrigin(0.5).setDepth(ORIENTATION_TEXT_DEPTH).setScrollFactor(0).setVisible(false);

    this.boundOrientationChange = (orientation: string) => {
      const wasPortrait = this.orientationStatus === 'portrait';
      this.orientationStatus = orientation.includes('portrait') ? 'portrait' : 'landscape';
      this.updateOrientationUI();
      this.syncFullscreenFromDocument();

      if (wasPortrait && this.orientationStatus === 'landscape' && (this.fullscreenStatus === 'denied' || this.fullscreenStatus === 'left') && !this.isDocumentFullscreen()) {
        this.fullscreenStatus = 'idle';
        this.showMainFullscreenPrompt();
      }

      // Update canvas bounds so pointer coordinates stay correct
      try {
        this.scene.scale.updateBounds();
      } catch {
        // best-effort; Phaser 4 may throw if bounds not initialized yet
      }

      // Reset joystick on orientation change to avoid stuck input
      this.resetJoystick();

      this.updateDebugState();
    };
    this.scene.scale.on('orientationchange', this.boundOrientationChange);

    this.updateOrientationUI();
  }

  private updateOrientationUI(): void {
    const isPortrait = this.orientationStatus === 'portrait';
    if (this.orientationOverlay) this.orientationOverlay.setVisible(isPortrait);
    if (this.orientationText) this.orientationText.setVisible(isPortrait);
  }

  // ── Cleanup Listeners ───────────────────────────────────────

  private setupCleanupListeners(): void {
    // Visibility change: page hidden → reset joystick
    if (typeof document !== 'undefined') {
      this.boundVisibilityChange = () => {
        if (document.hidden) {
          this.resetJoystick();
        }
      };
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
    }

    // Game blur: window loses focus → reset joystick
    this.boundGameBlur = () => {
      this.resetJoystick();
    };
    this.scene.game.events.on('blur', this.boundGameBlur);
  }

  // ── Debug State ─────────────────────────────────────────────

  private initDebugState(): void {
    setInputDebugState({
      ...createInitialInputDebugState(),
      deviceMode: this.isMobile ? 'mobile' : 'desktop',
    });
  }

  private updateDebugState(): void {
    setInputDebugState({
      deviceMode: this.isMobile ? 'mobile' : 'desktop',
      lockActive: this.locked,
      lockReason: this.lockReason,
      movementVector: { x: this.movementVector.x, y: this.movementVector.y },
      joystickPointerId: this.joystickPointerId,
      interactAction: this.interactAction,
      interactPressed: this.interactPressedThisFrame,
      fullscreenStatus: this.fullscreenStatus,
      orientationStatus: this.orientationStatus,
    });
  }

  getVisualDebugState(): Record<string, unknown> {
    return {
      theme: 'dark-pixel-horror',
      joystick: this.joystickBase ? this.boundsOf(this.joystickBase) : null,
      joystickThumb: this.joystickThumb ? this.boundsOf(this.joystickThumb) : null,
      interact: this.interactButton ? this.boundsOf(this.interactButton) : null,
      interactLabel: this.interactLabel ? this.boundsOf(this.interactLabel) : null,
      fullscreenPrompt: this.fullscreenOverlay ? this.boundsOf(this.fullscreenOverlay) : null,
      fullscreenButtonFill: this.fullscreenButton?.fillColor ?? null,
      interactFill: this.interactButton?.fillColor ?? null,
      tutorial: this.tutorialOverlay ? { ...this.boundsOf(this.tutorialOverlay), text: this.tutorialText?.text ?? '' } : null,
    };
  }

  private boundsOf(object: Phaser.GameObjects.Components.GetBounds & Phaser.GameObjects.Components.Visible & { depth?: number }): { x: number; y: number; width: number; height: number; visible: boolean; depth: number } {
    const bounds = object.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, visible: object.visible, depth: object.depth ?? 0 };
  }

  // ── Cleanup ─────────────────────────────────────────────────

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDesktopPointerDown, this);
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);

    // Remove visibility/blur listeners
    if (typeof document !== 'undefined' && this.boundVisibilityChange) {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
      this.boundVisibilityChange = null;
    }
    if (typeof document !== 'undefined' && this.boundFullscreenError) {
      document.removeEventListener('fullscreenerror', this.boundFullscreenError);
      this.boundFullscreenError = null;
    }
    if (typeof document !== 'undefined' && this.boundFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.boundFullscreenChange);
      this.boundFullscreenChange = null;
    }
    if (this.boundGameBlur) {
      this.scene.game.events.off('blur', this.boundGameBlur);
      this.boundGameBlur = null;
    }
    if (this.boundEnterFullscreen) {
      this.scene.scale.off('enterfullscreen', this.boundEnterFullscreen);
      this.boundEnterFullscreen = null;
    }
    if (this.boundLeaveFullscreen) {
      this.scene.scale.off('leavefullscreen', this.boundLeaveFullscreen);
      this.boundLeaveFullscreen = null;
    }
    if (this.boundOrientationChange) {
      this.scene.scale.off('orientationchange', this.boundOrientationChange);
      this.boundOrientationChange = null;
    }

    this.clearFullscreenFallbackTimeout();
    if (this.tutorialHideTimeout !== null) {
      clearTimeout(this.tutorialHideTimeout);
      this.tutorialHideTimeout = null;
    }

    if (this.boundTouchStart) {
      const canvas = this.scene.sys.game.canvas;
      if (canvas) {
        canvas.removeEventListener('touchstart', this.boundTouchStart);
      }
      this.boundTouchStart = null;
    }
  }
}
