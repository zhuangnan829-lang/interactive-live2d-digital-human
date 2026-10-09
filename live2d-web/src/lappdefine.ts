/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { LogLevel } from '@framework/live2dcubismframework';

/**
 * Sample Appで使用する定数
 */

// Canvas width and height pixel values, or dynamic screen size ('auto').
export const CanvasSize: { width: number; height: number } | 'auto' = 'auto';

// キャンバスの数
export const CanvasNum = 1;

// 画面
export const ViewScale = 1.72;
export const ViewMaxScale = 2.2;
export const ViewMinScale = 0.8;

export const ViewLogicalLeft = -1.0;
export const ViewLogicalRight = 1.0;
export const ViewLogicalBottom = -1.0;
export const ViewLogicalTop = 1.0;

export const ViewLogicalMaxLeft = -2.0;
export const ViewLogicalMaxRight = 2.0;
export const ViewLogicalMaxBottom = -2.0;
export const ViewLogicalMaxTop = 2.0;

// 相対パス
export const ResourcesPath = '../../Resources/';

// シェーダー相対パス
export const ShaderPath = '../../Framework/Shaders/WebGL/';

// モデルの後ろにある背景の画像ファイル
export const BackImageName = 'back_class_normal.png';

// 歯車
export const GearImageName = 'icon_gear.png';

// 終了ボタン
export const PowerImageName = 'CloseNormal.png';

// モデル定義---------------------------------------------
// モデルを配置したディレクトリ名の配列
// ディレクトリ名とmodel3.jsonの名前を一致させておくこと
export const ModelDir: string[] = [
  'haru_greeter_t05'
];
export const ModelDirSize: number = ModelDir.length;
export const Live2DAssetRevision = '20261009-rgba1024';

// 外部定義ファイル（json）と合わせる
export const MotionGroupIdle = ''; // Haru receptionist groups all motions under an empty key.
// Keep every authored presentation motion available, including the greeting
// and beckoning gestures. LAppModel locks each motion to exactly one arm-part
// family after Cubism's cross-fade, so restoring the complete pool cannot draw
// both mutually-exclusive arm sets at the same time.
// Start from a stable pose, then alternate calm and high-amplitude authored
// clips so the original greeting/waving gestures remain visible.
export const PresentationIntroMotionIndex = 0;
export const PresentationIdleMotionIndices = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
  14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26
];
export const PresentationArmBMotionIndices = [3, 4, 6, 7, 11, 15, 16, 20];
// Automatic idle playback must stay on one arm mesh family. Switching between
// the crossed/raised B artwork and the relaxed A artwork requires hiding one
// complete pair of arms before revealing the other; the recording shows this
// as a violent up/down jump. All 27 source motions remain loaded and available,
// while the unattended idle rotation uses only A-family clips that can blend
// geometrically without an arm-artwork swap. Motion 12 is omitted because it
// authors its own B-to-A part-opacity transition inside the clip.
export const PresentationAutomaticIdleMotionIndices = [
  1, 2, 5, 8, 9, 10, 13, 14, 17, 18, 19, 21, 22, 23, 24, 25, 26
];
// High-amplitude A-family clips that remain safe for automatic presentation.
export const PresentationGestureMotionIndices = [21, 22, 24, 26];
export const MotionGroupTapBody = 'TapBody'; // 体をタップしたとき

// 外部定義ファイル（json）と合わせる
export const HitAreaNameHead = 'Head';
export const HitAreaNameBody = 'Body';

// モーションの優先度定数
export const PriorityNone = 0;
export const PriorityIdle = 1;
export const PriorityNormal = 2;
export const PriorityForce = 3;

// MOC3の整合性検証オプション
export const MOCConsistencyValidationEnable = true;
// Bundled motion3.json files are fixed, reviewed project assets. Re-validating
// every curve on every refresh blocks the UI while the avatar starts. Keep the
// normal parser and all authored motions, but skip this redundant runtime pass.
export const MotionConsistencyValidationEnable = false;

// デバッグ用ログの表示オプション
export const DebugLogEnable = false;
export const DebugTouchLogEnable = false;

// Frameworkから出力するログのレベル設定
export const CubismLoggingLevel: LogLevel = LogLevel.LogLevel_Warning;

// デフォルトのレンダーターゲットサイズ
export const RenderTargetWidth = 1900;
export const RenderTargetHeight = 1000;
