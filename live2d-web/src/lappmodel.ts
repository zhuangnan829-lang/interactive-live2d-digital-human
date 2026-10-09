/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismDefaultParameterId } from '@framework/cubismdefaultparameterid';
import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson';
import {
  BreathParameterData,
  CubismBreath
} from '@framework/effect/cubismbreath';
import { LookParameterData, CubismLook } from '@framework/effect/cubismlook';
import { CubismEyeBlink } from '@framework/effect/cubismeyeblink';
import { ICubismModelSetting } from '@framework/icubismmodelsetting';
import { CubismIdHandle } from '@framework/id/cubismid';
import { CubismFramework } from '@framework/live2dcubismframework';
import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismUserModel } from '@framework/model/cubismusermodel';
import {
  ACubismMotion,
  BeganMotionCallback,
  FinishedMotionCallback
} from '@framework/motion/acubismmotion';
import { CubismMotion } from '@framework/motion/cubismmotion';
import {
  CubismMotionQueueEntryHandle,
  InvalidMotionQueueEntryHandleValue
} from '@framework/motion/cubismmotionqueuemanager';
import { CubismUpdateScheduler } from '@framework/motion/cubismupdatescheduler';
import { CubismBreathUpdater } from '@framework/motion/cubismbreathupdater';
import { CubismLookUpdater } from '@framework/motion/cubismlookupdater';
import { CubismEyeBlinkUpdater } from '@framework/motion/cubismeyeblinkupdater';
import { CubismExpressionUpdater } from '@framework/motion/cubismexpressionupdater';
import { CubismPhysicsUpdater } from '@framework/motion/cubismphysicsupdater';
import { CubismPoseUpdater } from '@framework/motion/cubismposeupdater';
import { CubismLipSyncUpdater } from '@framework/motion/cubismlipsyncupdater';
import { csmRect } from '@framework/type/csmrectf';
import {
  CSM_ASSERT,
  CubismLogError,
  CubismLogInfo
} from '@framework/utils/cubismdebug';

import * as LAppDefine from './lappdefine';
import { LAppPal } from './lapppal';
import { TextureInfo } from './lapptexturemanager';
import { LAppWavFileHandler } from './lappwavfilehandler';
import { CubismMoc } from '@framework/model/cubismmoc';
import { LAppDelegate } from './lappdelegate';
import { LAppSubdelegate } from './lappsubdelegate';
import { auditState, AuditEmotion, avatarLoadAudit, markAvatarLoadError, markAvatarLoadStage, markAvatarReady } from './auditstate';

enum LoadStep {
  LoadAssets,
  LoadModel,
  WaitLoadModel,
  LoadExpression,
  WaitLoadExpression,
  LoadPhysics,
  WaitLoadPhysics,
  LoadPose,
  WaitLoadPose,
  SetupEyeBlink,
  SetupBreath,
  LoadUserData,
  WaitLoadUserData,
  SetupEyeBlinkIds,
  SetupLipSyncIds,
  SetupLook,
  SetupLayout,
  LoadMotion,
  WaitLoadMotion,
  CompleteInitialize,
  CompleteSetupModel,
  LoadTexture,
  WaitLoadTexture,
  CompleteSetup
}

/**
 * ユーザーが実際に使用するモデルの実装クラス<br>
 * モデル生成、機能コンポーネント生成、更新処理とレンダリングの呼び出しを行う。
 */
export class LAppModel extends CubismUserModel {
  /**
   * model3.jsonが置かれたディレクトリとファイルパスからモデルを生成する
   * @param dir
   * @param fileName
   */
  public loadAssets(dir: string, fileName: string): void {
    this._modelHomeDir = dir;
    markAvatarLoadStage('modelJsonRequested');

    const retrySuffix = avatarLoadAudit.attempt > 1 ? `&retry=${avatarLoadAudit.attempt}` : '';
    fetch(`${this._modelHomeDir}${fileName}?v=${LAppDefine.Live2DAssetRevision}${retrySuffix}`)
      .then(response => {
        if (!response.ok) throw new Error(`Model JSON HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        markAvatarLoadStage('modelJsonLoaded');
        const setting: ICubismModelSetting = new CubismModelSettingJson(
          arrayBuffer,
          arrayBuffer.byteLength
        );

        // ステートを更新
        this._state = LoadStep.LoadModel;

        // 結果を保存
        this.setupModel(setting);
      })
      .catch(error => {
        // model3.json読み込みでエラーが発生した時点で描画は不可能なので、setupせずエラーをcatchして何もしない
        CubismLogError(`Failed to load file ${this._modelHomeDir}${fileName}`);
        markAvatarLoadError(
          `人物配置加载失败：${error instanceof Error ? error.message : String(error)}`
        );
      });
  }

  /**
   * model3.jsonからモデルを生成する。
   * model3.jsonの記述に従ってモデル生成、モーション、物理演算などのコンポーネント生成を行う。
   *
   * @param setting ICubismModelSettingのインスタンス
   */
  private setupModel(setting: ICubismModelSetting): void {
    this._updating = true;
    this._initialized = false;

    this._modelSetting = setting;

    // CubismModel
    if (this._modelSetting.getModelFileName() != '') {
      const modelFileName = this._modelSetting.getModelFileName();

      fetch(`${this._modelHomeDir}${modelFileName}`)
        .then(response => {
          if (!response.ok) throw new Error(`MOC HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          this.loadModel(arrayBuffer, this._mocConsistency);
          markAvatarLoadStage('mocLoaded');
          this._state = LoadStep.LoadExpression;

          // callback
          loadCubismExpression();
        })
        .catch(error => {
          CubismLogError(`Failed to load file ${this._modelHomeDir}${modelFileName}`);
          markAvatarLoadError(
            `人物模型加载失败：${error instanceof Error ? error.message : String(error)}`
          );
        });

      this._state = LoadStep.WaitLoadModel;
    } else {
      LAppPal.printMessage('Model data does not exist.');
    }

    // Expression
    const loadCubismExpression = (): void => {
      if (this._modelSetting.getExpressionCount() > 0) {
        const count: number = this._modelSetting.getExpressionCount();

        for (let i = 0; i < count; i++) {
          const expressionName = this._modelSetting.getExpressionName(i);
          const expressionFileName =
            this._modelSetting.getExpressionFileName(i);

          fetch(`${this._modelHomeDir}${expressionFileName}`)
            .then(response => {
              if (response.ok) {
                return response.arrayBuffer();
              } else if (response.status >= 400) {
                CubismLogError(
                  `Failed to load file ${this._modelHomeDir}${expressionFileName}`
                );
                // ファイルが存在しなくてもresponseはnullを返却しないため、空のArrayBufferで対応する
                return new ArrayBuffer(0);
              }
            })
            .then(arrayBuffer => {
              const motion: ACubismMotion = this.loadExpression(
                arrayBuffer,
                arrayBuffer.byteLength,
                expressionName
              );

              if (this._expressions.get(expressionName) != null) {
                ACubismMotion.delete(this._expressions.get(expressionName));
                this._expressions.set(expressionName, null);
              }

              this._expressions.set(expressionName, motion);

              this._expressionCount++;

              if (this._expressionCount >= count) {
                // Expression Updaterの追加
                if (this._expressionManager != null) {
                  const expressionUpdater = new CubismExpressionUpdater(
                    this._expressionManager
                  );
                  this._updateScheduler.addUpdatableList(expressionUpdater);
                }

                this._state = LoadStep.LoadPhysics;

                // callback
                loadCubismPhysics();
              }
            });
        }
        this._state = LoadStep.WaitLoadExpression;
      } else {
        this._state = LoadStep.LoadPhysics;

        // callback
        loadCubismPhysics();
      }
    };

    // Physics
    const loadCubismPhysics = (): void => {
      if (this._modelSetting.getPhysicsFileName() != '') {
        const physicsFileName = this._modelSetting.getPhysicsFileName();

        fetch(`${this._modelHomeDir}${physicsFileName}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${physicsFileName}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            this.loadPhysics(arrayBuffer, arrayBuffer.byteLength);

            // Physics Updaterの追加
            if (this._physics) {
              const physicsUpdater = new CubismPhysicsUpdater(this._physics);
              this._updateScheduler.addUpdatableList(physicsUpdater);
            }

            this._state = LoadStep.LoadPose;

            // callback
            loadCubismPose();
          });
        this._state = LoadStep.WaitLoadPhysics;
      } else {
        this._state = LoadStep.LoadPose;

        // callback
        loadCubismPose();
      }
    };

    // Pose
    const loadCubismPose = (): void => {
      if (this._modelSetting.getPoseFileName() != '') {
        const poseFileName = this._modelSetting.getPoseFileName();

        fetch(`${this._modelHomeDir}${poseFileName}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${poseFileName}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            this.loadPose(arrayBuffer, arrayBuffer.byteLength);

            // Pose Updaterの追加
            if (this._pose) {
              const poseUpdater = new CubismPoseUpdater(this._pose);
              this._updateScheduler.addUpdatableList(poseUpdater);
            }

            this._state = LoadStep.SetupEyeBlink;

            // callback
            setupEyeBlink();
          });
        this._state = LoadStep.WaitLoadPose;
      } else {
        this._state = LoadStep.SetupEyeBlink;

        // callback
        setupEyeBlink();
      }
    };

    // EyeBlink
    const setupEyeBlink = (): void => {
      if (this._modelSetting.getEyeBlinkParameterCount() > 0) {
        this._eyeBlink = CubismEyeBlink.create(this._modelSetting);
        const eyeBlinkUpdater = new CubismEyeBlinkUpdater(
          () => this._motionUpdated,
          this._eyeBlink
        );
        this._updateScheduler.addUpdatableList(eyeBlinkUpdater);
      }

      this._state = LoadStep.SetupBreath;

      // callback
      setupBreath();
    };

    // Breath
    const setupBreath = (): void => {
      this._breath = CubismBreath.create();

      const breathParameters: Array<BreathParameterData> = [
        new BreathParameterData(this._idParamAngleX, 0.0, 15.0, 6.5345, 0.5),
        new BreathParameterData(this._idParamAngleY, 0.0, 8.0, 3.5345, 0.5),
        new BreathParameterData(this._idParamAngleZ, 0.0, 10.0, 5.5345, 0.5),
        new BreathParameterData(
          this._idParamBodyAngleX,
          0.0,
          4.0,
          15.5345,
          0.5
        ),
        new BreathParameterData(
          CubismFramework.getIdManager().getId(
            CubismDefaultParameterId.ParamBreath
          ),
          0.5,
          0.5,
          3.2345,
          1
        )
      ];

      this._breath.setParameters(breathParameters);

      const breathUpdater = new CubismBreathUpdater(this._breath);
      this._updateScheduler.addUpdatableList(breathUpdater);

      this._state = LoadStep.LoadUserData;

      // callback
      loadUserData();
    };

    // UserData
    const loadUserData = (): void => {
      if (this._modelSetting.getUserDataFile() != '') {
        const userDataFile = this._modelSetting.getUserDataFile();

        fetch(`${this._modelHomeDir}${userDataFile}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${userDataFile}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            this.loadUserData(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlinkIds;

            // callback
            setupEyeBlinkIds();
          });

        this._state = LoadStep.WaitLoadUserData;
      } else {
        this._state = LoadStep.SetupEyeBlinkIds;

        // callback
        setupEyeBlinkIds();
      }
    };

    // EyeBlinkIds
    const setupEyeBlinkIds = (): void => {
      const eyeBlinkIdCount: number =
        this._modelSetting.getEyeBlinkParameterCount();

      this._eyeBlinkIds.length = eyeBlinkIdCount;
      for (let i = 0; i < eyeBlinkIdCount; ++i) {
        this._eyeBlinkIds[i] = this._modelSetting.getEyeBlinkParameterId(i);
      }

      this._state = LoadStep.SetupLipSyncIds;

      // callback
      setupLipSyncIds();
    };

    // LipSyncIds
    const setupLipSyncIds = (): void => {
      const lipSyncIdCount = this._modelSetting.getLipSyncParameterCount();

      this._lipSyncIds.length = lipSyncIdCount;
      for (let i = 0; i < lipSyncIdCount; ++i) {
        this._lipSyncIds[i] = this._modelSetting.getLipSyncParameterId(i);
      }

      // LipSync Updaterの追加
      if (this._lipSyncIds.length > 0) {
        const lipSyncUpdater = new CubismLipSyncUpdater(
          this._lipSyncIds,
          this._wavFileHandler
        );
        this._updateScheduler.addUpdatableList(lipSyncUpdater);
      }

      this._state = LoadStep.SetupLook;

      // callback
      setupLook();
    };

    // Look
    const setupLook = (): void => {
      this._look = CubismLook.create();

      const lookParameters: Array<LookParameterData> = [
        new LookParameterData(this._idParamAngleX, 30.0, 0.0, 0.0),
        new LookParameterData(this._idParamAngleY, 0.0, 30.0, 0.0),
        new LookParameterData(this._idParamAngleZ, 0.0, 0.0, -30.0),
        new LookParameterData(this._idParamBodyAngleX, 10.0, 0.0, 0.0),
        new LookParameterData(
          CubismFramework.getIdManager().getId(
            CubismDefaultParameterId.ParamEyeBallX
          ),
          1.0,
          0.0,
          0.0
        ),
        new LookParameterData(
          CubismFramework.getIdManager().getId(
            CubismDefaultParameterId.ParamEyeBallY
          ),
          0.0,
          1.0,
          0.0
        )
      ];

      this._look.setParameters(lookParameters);

      const lookUpdater = new CubismLookUpdater(this._look, this._dragManager);
      this._updateScheduler.addUpdatableList(lookUpdater);

      // callback
      finalizeUpdaters();
    };

    // UpdateScheduler最終化処理
    const finalizeUpdaters = (): void => {
      // 全てのUpdaterが追加されたのでUpdateSchedulerを最終ソート
      this._updateScheduler.sortUpdatableList();

      this._state = LoadStep.SetupLayout;

      // callback
      setupLayout();
    };

    // Layout
    const setupLayout = (): void => {
      const layout: Map<string, number> = new Map<string, number>();

      if (this._modelSetting == null || this._modelMatrix == null) {
        CubismLogError('Failed to setupLayout().');
        return;
      }

      this._modelSetting.getLayoutMap(layout);
      this._modelMatrix.setupFromLayout(layout);
      this._state = LoadStep.LoadMotion;

      // callback
      loadCubismMotion();
    };

    // Motion
    const loadCubismMotion = (): void => {
      markAvatarLoadStage('motionLoadingStarted');
      this._state = LoadStep.WaitLoadMotion;
      this._model.saveParameters();
      this._allMotionCount = 0;
      this._motionCount = 0;
      const group: string[] = [];

      const motionGroupCount: number = this._modelSetting.getMotionGroupCount();

      // モーションの総数を求める
      for (let i = 0; i < motionGroupCount; i++) {
        group[i] = this._modelSetting.getMotionGroupName(i);
        this._allMotionCount += this._modelSetting.getMotionCount(group[i]);
      }

      if (motionGroupCount == 0) {
        markAvatarLoadStage('motionsLoaded');
      }

      // Motion files are optional for the first frame. Start the large texture
      // downloads immediately and let authored motions finish in parallel.
      // This preserves the complete hand/body motion set without making it a
      // render-blocking dependency.
      this._motionManager.stopAllMotions();
      this._updating = false;
      this._initialized = true;
      this._state = LoadStep.LoadTexture;
      this.createRenderer(
        this._subdelegate.getCanvas().width,
        this._subdelegate.getCanvas().height
      );
      this.setupTextures();
      this.getRenderer().startUp(this._subdelegate.getGlManager().getGl());
      this.getRenderer().loadShaders(LAppDefine.ShaderPath);

      // Motion JSON parsing is CPU-heavy. Start it only after the real model
      // textures are ready, one file per idle slice, so startup never blocks
      // input or starves the WebGL render loop. All authored motions remain
      // available once the background queue completes.
      this._deferredMotionGroups = group;

      // モーションがない場合
      if (motionGroupCount == 0) {
        return;
      }
    };
  }

  /**
   * テクスチャユニットにテクスチャをロードする
   */
  private setupTextures(): void {
    // iPhoneでのアルファ品質向上のためTypescriptではpremultipliedAlphaを採用
    const usePremultiply = true;

    if (this._state == LoadStep.LoadTexture) {
      markAvatarLoadStage('texturesRequested');
      // テクスチャ読み込み用
      const textureCount: number = this._modelSetting.getTextureCount();

      for (
        let modelTextureNumber = 0;
        modelTextureNumber < textureCount;
        modelTextureNumber++
      ) {
        // テクスチャ名が空文字だった場合はロード・バインド処理をスキップ
        if (this._modelSetting.getTextureFileName(modelTextureNumber) == '') {
          console.log('getTextureFileName null');
          continue;
        }

        // WebGLのテクスチャユニットにテクスチャをロードする
        let texturePath =
          this._modelSetting.getTextureFileName(modelTextureNumber);
        texturePath = this._modelHomeDir + texturePath;

        // ロード完了時に呼び出すコールバック関数
        const onLoad = (textureInfo: TextureInfo): void => {
          this.getRenderer().bindTexture(modelTextureNumber, textureInfo.id);

          this._textureCount++;

          if (this._textureCount >= textureCount) {
            // ロード完了
            this._state = LoadStep.CompleteSetup;
            markAvatarLoadStage('texturesLoaded');
            // Do not leave the first visible frame at the mercy of a throttled
            // requestAnimationFrame callback. The textures and renderer are
            // ready here, so draw one real frame immediately. The regular RAF
            // loop continues animation from the following frame.
            this._subdelegate.update();
            for (const group of this._deferredMotionGroups) {
              this.preLoadMotionGroup(group);
            }
            this._deferredMotionGroups = [];
          }
        };

        // 読み込み
        this._subdelegate
          .getTextureManager()
          .createTextureFromPngFile(texturePath, usePremultiply, onLoad);
        this.getRenderer().setIsPremultipliedAlpha(usePremultiply);
      }

      this._state = LoadStep.WaitLoadTexture;
    }
  }

  /**
   * レンダラを再構築する
   */
  public reloadRenderer(): void {
    this.deleteRenderer();
    this.createRenderer(
      this._subdelegate.getCanvas().width,
      this._subdelegate.getCanvas().height
    );
    this.setupTextures();
  }

  /**
   * 更新
   */
  public update(): void {
    if (this._state != LoadStep.CompleteSetup) return;

    const deltaTimeSeconds: number = LAppPal.getDeltaTime();
    this._userTimeSeconds += deltaTimeSeconds;

    //--------------------------------------------------------------------------
    this._model.loadParameters(); // 前回セーブされた状態をロード

    // Reset motion updated flag each frame
    this._motionUpdated = false;

    // Keep the camera-safe pose through the short finish blend. Authored idle
    // actions resume only after MotionController has returned to `idle`.
    const presenterMode = auditState.speaking || auditState.motionState === 'finished';
    const motionsReady = this._motionCount >= this._allMotionCount;
    if (presenterMode && !this._presenterModeActive) {
      // Interrupt any idle/greeting clip the instant speech starts. Otherwise
      // a previously-started wave can keep playing under the presenter layer.
      this._motionManager.stopAllMotions();
      this._presentationMotionIndex = LAppDefine.PresentationIntroMotionIndex;
      if (motionsReady) {
        this.startMotion(
          LAppDefine.MotionGroupIdle,
          this._presentationMotionIndex,
          LAppDefine.PriorityIdle
        );
      }
      this._presenterExitActive = false;
      this._presenterExitElapsed = 0;
    } else if (!presenterMode && this._presenterModeActive && motionsReady) {
      // The finish blend has completed. Land on the neutral clip and hold it
      // before restoring authored idle actions; immediately forcing a gesture
      // here caused repeated raise/lower cycles right after every broadcast.
      this._motionManager.stopAllMotions();
      this._idleNeutralCyclesRemaining = 1;
      this._presenterExitActive = true;
      this._presenterExitElapsed = 0;
      this._presentationMotionIndex = LAppDefine.PresentationIntroMotionIndex;
      this.startMotion(
        LAppDefine.MotionGroupIdle,
        this._presentationMotionIndex,
        LAppDefine.PriorityIdle
      );
    } else if (this._motionManager.isFinished() && motionsReady) {
      this._presentationMotionIndex = presenterMode
        ? LAppDefine.PresentationIntroMotionIndex
        : this.takeNextIdleMotion();
      this.startMotion(
        LAppDefine.MotionGroupIdle,
        this._presentationMotionIndex,
        LAppDefine.PriorityIdle
      );
    } else if (!this._motionManager.isFinished()) {
      this._motionUpdated = this._motionManager.updateMotion(
        this._model,
        deltaTimeSeconds
      ); // モーションを更新
    }
    this._presenterModeActive = presenterMode;
    this._model.saveParameters(); // 状態を保存
    //--------------------------------------------------------------------------

    // UpdateSchedulerによる一括エフェクト更新
    this._updateScheduler.onLateUpdate(this._model, deltaTimeSeconds);

    // Every source motion animates both alternative arm-part opacities. During
    // Cubism cross-fades that can briefly expose both arm drawings. Select the
    // family authored for the current motion after all motion/pose updates so
    // greeting and beckoning motions stay available without ghost arms.
    const armFamilyB = !presenterMode && LAppDefine.PresentationArmBMotionIndices.indexOf(
      this._presentationMotionIndex
    ) >= 0;
    const partId = (name: string) => CubismFramework.getIdManager().getId(name);
    let armAOpacity = armFamilyB ? 0 : 1;
    let armBOpacity = armFamilyB ? 1 : 0;
    let armTransitionProgress = 1;
    if (presenterMode) {
      this._visibleArmFamilyB = false;
      this._targetArmFamilyB = false;
      this._armFamilyTransitionDuration = 0.72;
      this._armFamilyTransitionElapsed = this._armFamilyTransitionDuration;
    } else {
      if (armFamilyB !== this._targetArmFamilyB) {
        this._visibleArmFamilyB = this._targetArmFamilyB;
        this._targetArmFamilyB = armFamilyB;
        // Returning from the raised B-arm artwork to the relaxed A-arm
        // artwork is the visually sensitive direction. Give that descent
        // substantially more time than the lift so the hands do not snap.
        this._armFamilyTransitionDuration = this._visibleArmFamilyB && !armFamilyB
          ? 1.45
          : 0.72;
        this._armFamilyTransitionElapsed = 0;
      }
      if (this._visibleArmFamilyB !== this._targetArmFamilyB) {
        const transitionDuration = this._armFamilyTransitionDuration;
        this._armFamilyTransitionElapsed = Math.min(
          transitionDuration,
          this._armFamilyTransitionElapsed + Math.min(deltaTimeSeconds, 0.05)
        );
        const progress = this._armFamilyTransitionElapsed / transitionDuration;
        armTransitionProgress = progress;
        const halfProgress = progress < 0.5 ? progress * 2 : (progress - 0.5) * 2;
        const eased = halfProgress * halfProgress * (3 - 2 * halfProgress);
        // Fade the old drawing fully out before fading the new drawing in.
        // The two mutually-exclusive arm meshes are never visible together.
        const oldOpacity = progress < 0.5 ? 1 - eased : 0;
        const newOpacity = progress < 0.5 ? 0 : eased;
        armAOpacity = this._visibleArmFamilyB ? newOpacity : oldOpacity;
        armBOpacity = this._visibleArmFamilyB ? oldOpacity : newOpacity;
        if (progress >= 1) this._visibleArmFamilyB = this._targetArmFamilyB;
      }
    }
    for (const name of ['Part01ArmRA001', 'Part01ArmLA001']) {
      this._model.setPartOpacityById(partId(name), armAOpacity);
    }
    for (const name of ['Part01ArmRB001', 'Part01ArmLB001']) {
      this._model.setPartOpacityById(partId(name), armBOpacity);
    }

    // expressionStrength is the single 0..1 intensity control shared by face
    // and motion. It never scales ParamMouthOpenY, which stays audio-driven.
    const expressionStrength = Math.min(1, Math.max(0, auditState.expressionStrength));
    const cueExpression = auditState.semanticExpression * expressionStrength;
    const cueGesture = auditState.semanticGesture * expressionStrength;
    const cueHead = auditState.semanticHead * expressionStrength;
    const emotionGestureBoost = auditState.emotion === 'smile'
      ? 1.08
      : auditState.emotion === 'serious'
        ? 1.05
        : 1;
    const gestureScale = (0.82 + expressionStrength * 0.18) * emotionGestureBoost * (1 + cueGesture * 0.16);

    // Keep authored arm gestures while making their amplitude follow the
    // expression intensity and retaining the panel-safe reach limit.
    for (const parameterName of [
      'ParamArmLA',
      'ParamArmLB',
      'ParamArmRA',
      'ParamArmRB'
    ]) {
      const parameterId = CubismFramework.getIdManager().getId(parameterName);
      this._model.setParameterValueById(
        parameterId,
        this._model.getParameterValueById(parameterId) * gestureScale
      );
    }

    // Apply business-state controls after idle/blink/breath so that the
    // expression and real-audio mouth values remain observable every frame.
    const id = (name: string) => CubismFramework.getIdManager().getId(name);
    const s = expressionStrength;
    const now = performance.now() * 0.001;
    const motionEase = 1 - Math.exp(-deltaTimeSeconds * 3.8);
    if (this._emotionTarget !== auditState.emotion) {
      this._emotionTarget = auditState.emotion;
      this._emotionTransitionElapsed = 0;
      this._emotionTransitionStartedAt = performance.now();
      this._emotionTransitionStartSmile = this._emotionBlendSmile;
      this._emotionTransitionStartSerious = this._emotionBlendSerious;
      this._emotionTransitionStartCurious = this._emotionBlendCurious;
    }
    // A short cross-fade keeps the face soft without leaving the previous
    // emotion visibly mixed into the newly selected state.
    const emotionTransitionDuration = 0.9;
    const previousEmotionTransitionElapsed = this._emotionTransitionElapsed;
    this._emotionTransitionElapsed = Math.min(
      emotionTransitionDuration,
      (performance.now() - this._emotionTransitionStartedAt) / 1000
    );
    const emotionLinearProgress = this._emotionTransitionElapsed / emotionTransitionDuration;
    const emotionProgress = emotionLinearProgress * emotionLinearProgress * (3 - 2 * emotionLinearProgress);
    const emotionTargetSmile = this._emotionTarget === 'smile' ? 1 : 0;
    const emotionTargetSerious = this._emotionTarget === 'serious' ? 1 : 0;
    const emotionTargetCurious = this._emotionTarget === 'curious' ? 1 : 0;
    this._emotionBlendSmile = this._emotionTransitionStartSmile
      + (emotionTargetSmile - this._emotionTransitionStartSmile) * emotionProgress;
    this._emotionBlendSerious = this._emotionTransitionStartSerious
      + (emotionTargetSerious - this._emotionTransitionStartSerious) * emotionProgress;
    this._emotionBlendCurious = this._emotionTransitionStartCurious
      + (emotionTargetCurious - this._emotionTransitionStartCurious) * emotionProgress;
    if (
      this._emotionTransitionElapsed < emotionTransitionDuration ||
      previousEmotionTransitionElapsed < emotionTransitionDuration ||
      !document.documentElement.dataset.emotionTransition
    ) {
      document.documentElement.dataset.emotionTransition = JSON.stringify({
        target: this._emotionTarget,
        elapsedMs: Math.round(this._emotionTransitionElapsed * 1000),
        progress: Number(emotionProgress.toFixed(4)),
        smile: Number(this._emotionBlendSmile.toFixed(4)),
        serious: Number(this._emotionBlendSerious.toFixed(4)),
        curious: Number(this._emotionBlendCurious.toFixed(4))
      });
    }
    const speakingTarget = auditState.speaking && !auditState.speechPaused ? 1 : 0;
    const emphasisTarget = auditState.motionState === 'emphasis' && !auditState.speechPaused ? 1 : 0;
    this._speechMotionBlend += (speakingTarget - this._speechMotionBlend) * motionEase;
    this._emphasisMotionBlend += (emphasisTarget - this._emphasisMotionBlend) * motionEase;

    const naturalMotionScale = 0.28 + s * 0.72;
    this._model.addParameterValueById(id('ParamAngleX'), Math.sin(now * 0.52) * 1.15 * naturalMotionScale);
    this._model.addParameterValueById(id('ParamAngleY'), Math.sin(now * 0.39 + 0.7) * 0.65 * naturalMotionScale);
    this._model.addParameterValueById(id('ParamAngleZ'), Math.sin(now * 0.31 + 1.4) * 0.42 * naturalMotionScale);
    this._model.addParameterValueById(id('ParamEyeBallX'), Math.sin(now * 0.37) * 0.12 * s);
    this._model.addParameterValueById(id('ParamEyeBallY'), Math.sin(now * 0.29 + 0.8) * 0.06 * s);

    const semanticExpressionBoost = 1 + cueExpression * 0.18;
    const smile = this._emotionBlendSmile * s * semanticExpressionBoost;
    const serious = this._emotionBlendSerious * s * semanticExpressionBoost;
    const curious = this._emotionBlendCurious * s * semanticExpressionBoost;

    // Authored body motions also contain facial curves. Clear only those
    // expression channels before applying the panel selection, otherwise a
    // motion's raised eyebrow can make “认真” look like “疑惑”. Eye-open and
    // mouth-open are intentionally untouched so blink and lip sync remain live.
    for (const parameterName of [
      'ParamMouthForm',
      'ParamEyeLSmile',
      'ParamEyeRSmile',
      'ParamBrowLY',
      'ParamBrowRY',
      'ParamBrowLX',
      'ParamBrowRX',
      'ParamBrowLAngle',
      'ParamBrowRAngle',
      'ParamBrowLForm',
      'ParamBrowRForm',
      'ParamTear'
    ]) {
      this._model.setParameterValueById(id(parameterName), 0);
    }
    this._model.addParameterValueById(id('ParamMouthForm'), 0.78 * smile - 0.08 * serious - 0.06 * curious);
    this._model.addParameterValueById(id('ParamEyeLSmile'), 0.8 * smile);
    this._model.addParameterValueById(id('ParamEyeRSmile'), 0.8 * smile);
    this._model.addParameterValueById(id('ParamBrowLY'), 0.12 * smile - 0.58 * serious + 1.0 * curious);
    this._model.addParameterValueById(id('ParamBrowRY'), 0.12 * smile - 0.58 * serious - 0.48 * curious);
    // Serious stays deliberately symmetrical and focused. Curiosity owns the
    // asymmetric brow profile so the two states cannot read as one another.
    this._model.addParameterValueById(id('ParamBrowLAngle'), 0.6 * curious);
    this._model.addParameterValueById(id('ParamBrowRAngle'), -0.18 * curious);
    this._model.addParameterValueById(id('ParamBrowLForm'), 0.3 * serious + 0.24 * curious);
    this._model.addParameterValueById(id('ParamBrowRForm'), 0.3 * serious - 0.06 * curious);
    this._model.addParameterValueById(id('ParamEyeLOpen'), -0.14 * serious + 0.12 * curious);
    this._model.addParameterValueById(id('ParamEyeROpen'), -0.14 * serious - 0.08 * curious);
    this._model.setPartOpacityById(partId('Part01Hoho001'), Math.min(0.28, smile * 0.28));
    this._model.setPartOpacityById(partId('Part01Tear'), 0);
    this._model.addParameterValueById(id('ParamEyeBallX'), 0.42 * curious);
    this._model.addParameterValueById(id('ParamEyeBallY'), cueExpression * 0.04);
    this._model.addParameterValueById(id('ParamAngleY'), -3.4 * serious);
    this._model.addParameterValueById(id('ParamAngleZ'), 22 * curious);

    if (presenterMode) {
      // Camera lock: face and pupils stay on the audience while native blink
      // and audio-driven mouth movement remain untouched.
      this._model.setParameterValueById(id('ParamEyeBallX'), 0);
      this._model.setParameterValueById(id('ParamEyeBallY'), 0);
      this._model.setParameterValueById(id('ParamAngleX'), 0);
      this._model.setParameterValueById(id('ParamAngleY'), 0);
      this._model.setParameterValueById(id('ParamAngleZ'), 0);
      this._model.setParameterValueById(id('ParamBodyAngleX'), 0);
      this._model.setParameterValueById(id('ParamBodyAngleY'), 0);
      this._model.setParameterValueById(id('ParamBodyAngleZ'), 0);

      // Stable A-arm presenter pose. It prevents a raised-hand clip from
      // finishing during speech and removes A/B arm overlap on the way down.
      this._model.setParameterValueById(id('ParamArmLA'), 1);
      this._model.setParameterValueById(id('ParamArmRA'), 1);
      this._model.setParameterValueById(id('ParamArmLB'), 0);
      this._model.setParameterValueById(id('ParamArmRB'), 0);
      this._model.setParameterValueById(id('ParamHandChangeR'), 0);
      this._model.setParameterValueById(id('ParamHandAngleR'), -0.1);
      this._model.setParameterValueById(id('ParamHandDhangeL'), 0);
      this._model.setParameterValueById(id('ParamHandAngleL'), 0.1);
    }

    // Speech rhythm is deliberately low-amplitude: energy drives a soft nod,
    // cadence a slow upper-body sway, and emphasis a brief forward lean.
    const energy = auditState.speechEnergy;
    const intensity = auditState.speechIntensity;
    const cadence = auditState.speechCadence;
    const pulse = auditState.emphasisPulse;
    const speechActivityScale = (0.22 + intensity * 0.78) * (0.38 + s * 0.62);
    const gesturePulse = auditState.gesturePulse;
    const peakNod = auditState.gestureType === 'nod' ? gesturePulse * 2.15 : 0;
    const openHand = auditState.gestureType === 'open_hand' ? gesturePulse : 0;
    const nod = Math.sin(now * (1.8 + cadence * 1.1)) * (0.12 + energy * 1.35) * this._speechMotionBlend * speechActivityScale;
    const bodyRhythm = Math.sin(now * (0.92 + cadence * 0.42)) * (0.16 + intensity * 0.46) * this._speechMotionBlend * speechActivityScale;
    const emotionLean = 0.32 * smile + 0.78 * serious + 0.16 * curious;
    const cueHeadDirection = auditState.activeCueType === 'question' && auditState.activeCueIndex % 2 === 1 ? -1 : 1;
    this._model.addParameterValueById(id('ParamAngleY'), nod - peakNod - 1.15 * this._emphasisMotionBlend - cueHead * 0.72);
    this._model.addParameterValueById(id('ParamAngleZ'), cueHead * cueHeadDirection * 1.8);
    this._model.addParameterValueById(id('ParamAngleX'), bodyRhythm * 0.45);
    this._model.addParameterValueById(id('ParamBodyAngleX'), bodyRhythm);
    this._model.addParameterValueById(id('ParamBodyAngleY'), -emotionLean - (0.8 * this._emphasisMotionBlend + pulse * 0.55 + cueGesture * 0.38) * speechActivityScale);
    this._model.addParameterValueById(id('ParamBodyUpper'), (0.025 + pulse * 0.045 + cueGesture * 0.035) * this._speechMotionBlend * speechActivityScale);
    // A short open-palm accent requires both an audio peak and a matching
    // welcome/introduction cue. Loudness alone can never select this gesture.
    this._model.addParameterValueById(id('ParamHandChangeR'), openHand * 0.72);
    this._model.addParameterValueById(id('ParamHandAngleR'), openHand * 2.4);

    // A completed broadcast leaves a deliberately neutral presenter pose.
    // The authored idle clip can begin far away from that pose, especially on
    // its vertical body and head curves. Fade those channels back in over a
    // dedicated settle window so the avatar cannot bounce when speech ends.
    let presenterExitProgress = presenterMode ? 0 : 1;
    if (!presenterMode && this._presenterExitActive) {
      const exitDuration = 2.6;
      this._presenterExitElapsed = Math.min(
        exitDuration,
        this._presenterExitElapsed + Math.min(deltaTimeSeconds, 0.05)
      );
      const linearProgress = this._presenterExitElapsed / exitDuration;
      presenterExitProgress = linearProgress * linearProgress * (3 - 2 * linearProgress);

      for (const parameterName of [
        'ParamAngleX',
        'ParamAngleY',
        'ParamAngleZ',
        'ParamBodyAngleX',
        'ParamBodyAngleY',
        'ParamBodyAngleZ',
        'ParamBodyUpper',
        'ParamBustY'
      ]) {
        const parameterId = id(parameterName);
        this._model.setParameterValueById(
          parameterId,
          this._model.getParameterValueById(parameterId) * presenterExitProgress
        );
      }

      for (const [parameterName, presenterValue] of [
        ['ParamArmLA', 1],
        ['ParamArmRA', 1],
        ['ParamArmLB', 0],
        ['ParamArmRB', 0],
        ['ParamHandAngleR', -0.1],
        ['ParamHandAngleL', 0.1]
      ] as Array<[string, number]>) {
        const parameterId = id(parameterName);
        const authoredValue = this._model.getParameterValueById(parameterId);
        this._model.setParameterValueById(
          parameterId,
          presenterValue + (authoredValue - presenterValue) * presenterExitProgress
        );
      }

      if (linearProgress >= 1) this._presenterExitActive = false;
    }

    // HandChange is a discrete artwork selector (closed / relaxed / open),
    // not a continuous deformer. Intermediate values blend multiple hand
    // drawings and look like a persistent ghost. Quantize it with hysteresis
    // after all authored and semantic motion values have been applied.
    const rawHandShapeR = this._model.getParameterValueById(id('ParamHandChangeR'));
    const rawHandShapeL = this._model.getParameterValueById(id('ParamHandDhangeL'));
    // Keep the outgoing hand drawing unchanged until its arm layer is fully
    // invisible. Changing the hand selector while that layer is still visible
    // is perceived as a second hand/ghost even when arm opacities do not
    // overlap. The new hand shape is selected at the zero-opacity midpoint.
    const holdOutgoingHandShape = this._visibleArmFamilyB !== this._targetArmFamilyB
      && armTransitionProgress < 0.5;
    if (!holdOutgoingHandShape) {
      this._handShapeR = this.resolveHandShape(rawHandShapeR, this._handShapeR);
      this._handShapeL = this.resolveHandShape(rawHandShapeL, this._handShapeL);
    }
    this._model.setParameterValueById(id('ParamHandChangeR'), this._handShapeR);
    this._model.setParameterValueById(id('ParamHandDhangeL'), this._handShapeL);

    this._model.setParameterValueById(
      id('ParamMouthOpenY'),
      Math.min(1, Math.max(0, auditState.mouth))
    );
    document.documentElement.dataset.presenterLock = JSON.stringify({
      active: presenterMode,
      motionsReady,
      motionIndex: this._presentationMotionIndex,
      eyeX: Number(this._model.getParameterValueById(id('ParamEyeBallX')).toFixed(3)),
      eyeY: Number(this._model.getParameterValueById(id('ParamEyeBallY')).toFixed(3)),
      eyeLOpen: Number(this._model.getParameterValueById(id('ParamEyeLOpen')).toFixed(3)),
      eyeROpen: Number(this._model.getParameterValueById(id('ParamEyeROpen')).toFixed(3)),
      headX: Number(this._model.getParameterValueById(id('ParamAngleX')).toFixed(3)),
      headY: Number(this._model.getParameterValueById(id('ParamAngleY')).toFixed(3)),
      headZ: Number(this._model.getParameterValueById(id('ParamAngleZ')).toFixed(3)),
      bodyY: Number(this._model.getParameterValueById(id('ParamBodyAngleY')).toFixed(3)),
      bodyUpper: Number(this._model.getParameterValueById(id('ParamBodyUpper')).toFixed(3)),
      presenterExitActive: this._presenterExitActive,
      presenterExitProgress: Number(presenterExitProgress.toFixed(3)),
      armLA: Number(this._model.getParameterValueById(id('ParamArmLA')).toFixed(3)),
      armRA: Number(this._model.getParameterValueById(id('ParamArmRA')).toFixed(3)),
      armAOpacity: Number(this._model.getPartOpacityById(partId('Part01ArmRA001')).toFixed(3)),
      armBOpacity: Number(this._model.getPartOpacityById(partId('Part01ArmRB001')).toFixed(3)),
      armTransitionProgress: Number(armTransitionProgress.toFixed(3)),
      armTransitionDuration: this._armFamilyTransitionDuration,
      holdOutgoingHandShape,
      rawHandShapeR: Number(rawHandShapeR.toFixed(3)),
      rawHandShapeL: Number(rawHandShapeL.toFixed(3)),
      handShapeR: this._handShapeR,
      handShapeL: this._handShapeL,
    });
    const functional = (window as Window & { __live2dFunctional?: { parameterSnapshot?: Record<string, number> } }).__live2dFunctional;
    if (functional) {
      functional.parameterSnapshot = {
        mouthOpenY: auditState.mouth,
        expressionStrength: s,
        gestureScale,
        presentationMotionIndex: this._presentationMotionIndex,
        armPartFamily: armFamilyB ? 2 : 1,
        naturalMotionScale,
        speechActivityScale,
        playbackProgress: auditState.playbackProgress,
        activeCueIndex: auditState.activeCueIndex,
        semanticExpression: cueExpression,
        semanticGesture: cueGesture,
        semanticHead: cueHead,
        mouthForm: 0.78 * smile - 0.22 * serious - 0.08 * curious,
        browLY: 0.12 * smile - 0.42 * serious + 0.52 * curious,
        browRY: 0.12 * smile - 0.42 * serious - 0.08 * curious,
        headZ: 8.5 * curious + Math.sin(now * 0.31 + 1.4) * 0.42 * naturalMotionScale,
        speechEnergy: energy,
        speechIntensity: intensity,
        speechPaused: auditState.speechPaused ? 1 : 0,
        energyPeak: auditState.energyPeak,
        gesturePulse,
        speechCadence: cadence,
        emphasisPulse: pulse,
        emotionTransitionProgress: emotionProgress,
        emotionSmileBlend: this._emotionBlendSmile,
        emotionSeriousBlend: this._emotionBlendSerious,
        emotionCuriousBlend: this._emotionBlendCurious,
        armAOpacity: this._model.getPartOpacityById(partId('Part01ArmRA001')),
        armBOpacity: this._model.getPartOpacityById(partId('Part01ArmRB001')),
        speechMotionBlend: this._speechMotionBlend,
        emphasisMotionBlend: this._emphasisMotionBlend,
      };
    }

    this._model.update();
  }

  /**
   * 引数で指定したモーションの再生を開始する
   * @param group モーショングループ名
   * @param no グループ内の番号
   * @param priority 優先度
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
   */
  public startMotion(
    group: string,
    no: number,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
    onBeganMotionHandler?: BeganMotionCallback
  ): CubismMotionQueueEntryHandle {
    if (priority == LAppDefine.PriorityForce) {
      this._motionManager.setReservePriority(priority);
    } else if (!this._motionManager.reserveMotion(priority)) {
      if (this._debugMode) {
        LAppPal.printMessage("[APP]can't start motion.");
      }
      return InvalidMotionQueueEntryHandleValue;
    }

    const motionFileName = this._modelSetting.getMotionFileName(group, no);

    // ex) idle_0
    const name = `${group}_${no}`;
    let motion: CubismMotion = this._motions.get(name) as CubismMotion;
    let autoDelete = false;

    if (motion == null) {
      // Initial motion files are already loading in the background. Avoid
      // starting duplicate fetches on every animation frame before that
      // preload finishes.
      if (this._motionCount < this._allMotionCount) {
        this._motionManager.setReservePriority(LAppDefine.PriorityNone);
        return InvalidMotionQueueEntryHandleValue;
      }
      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then(response => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`
            );
            return new ArrayBuffer(0);
          }
        })
        .then(arrayBuffer => {
          motion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            null,
            onFinishedMotionHandler,
            onBeganMotionHandler,
            this._modelSetting,
            group,
            no,
            this._motionConsistency
          );
        });

      if (motion) {
        motion.setLoop(false);
        motion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);
        autoDelete = true; // 終了時にメモリから削除
      } else {
        CubismLogError("Can't start motion {0} .", motionFileName);
        // ロードできなかったモーションのReservePriorityをリセットする
        this._motionManager.setReservePriority(LAppDefine.PriorityNone);
        return InvalidMotionQueueEntryHandleValue;
      }
    } else {
      motion.setBeganMotionHandler(onBeganMotionHandler);
      motion.setFinishedMotionHandler(onFinishedMotionHandler);
    }

    //voice
    const voice = this._modelSetting.getMotionSoundFileName(group, no);
    if (voice.localeCompare('') != 0) {
      let path = voice;
      path = this._modelHomeDir + path;
      this._wavFileHandler.start(path);
    }

    if (this._debugMode) {
      LAppPal.printMessage(`[APP]start motion: [${group}_${no}]`);
    }
    // Authored idle actions ease into their first pose instead of snapping
    // from the previous clip. Speech interruption stays deliberately quick.
    // The neutral clip is also the landing pose after every authored action.
    // Its longer non-speaking fade gives raised hands time to settle instead
    // of dropping to the relaxed pose in under a second.
    const returningToNeutral = no === LAppDefine.PresentationIntroMotionIndex;
    const transitionSeconds = auditState.speaking
      ? 0.16
      : returningToNeutral
        ? 1.45
        : 0.82;
    motion.setFadeInTime(transitionSeconds);
    motion.setFadeOutTime(transitionSeconds);
    document.documentElement.dataset.presentationMotion = JSON.stringify({
      index: no,
      armFamily: LAppDefine.PresentationArmBMotionIndices.indexOf(no) >= 0 ? 'B' : 'A'
    });
    return this._motionManager.startMotionPriority(
      motion,
      autoDelete,
      priority
    );
  }

  /**
   * Alternate the complete authored idle set with its presentation gestures.
   * This scheduler is used only while speech is inactive.
   */
  private takeNextIdleMotion(): number {
    const actions = LAppDefine.PresentationAutomaticIdleMotionIndices;
    if (actions.length === 0 || this._idleNeutralCyclesRemaining > 0) {
      this._idleNeutralCyclesRemaining = Math.max(
        0,
        this._idleNeutralCyclesRemaining - 1
      );
      return LAppDefine.PresentationIntroMotionIndex;
    }
    const next = actions[this._idleActionCursor % actions.length];
    this._idleActionCursor++;
    // Two complete neutral clips separate authored gestures. All original
    // motions remain available, but large hand actions no longer run almost
    // continuously while the avatar is idle.
    this._idleNeutralCyclesRemaining = 2;
    return next;
  }

  private resolveHandShape(rawValue: number, current: number): number {
    const value = Math.min(1, Math.max(0, rawValue));
    if (current <= 0) return value >= 0.34 ? 0.5 : 0;
    if (current >= 1) return value <= 0.66 ? 0.5 : 1;
    if (value <= 0.16) return 0;
    if (value >= 0.84) return 1;
    return 0.5;
  }

  /**
   * ランダムに選ばれたモーションの再生を開始する。
   * @param group モーショングループ名
   * @param priority 優先度
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
   */
  public startRandomMotion(
    group: string,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
    onBeganMotionHandler?: BeganMotionCallback
  ): CubismMotionQueueEntryHandle {
    if (auditState.speaking) return InvalidMotionQueueEntryHandleValue;
    if (this._modelSetting.getMotionCount(group) == 0) {
      return InvalidMotionQueueEntryHandleValue;
    }

    const no: number = Math.floor(
      Math.random() * this._modelSetting.getMotionCount(group)
    );

    return this.startMotion(
      group,
      no,
      priority,
      onFinishedMotionHandler,
      onBeganMotionHandler
    );
  }

  /**
   * 引数で指定した表情モーションをセットする
   *
   * @param expressionId 表情モーションのID
   */
  public setExpression(expressionId: string): void {
    const motion: ACubismMotion = this._expressions.get(expressionId);

    if (this._debugMode) {
      LAppPal.printMessage(`[APP]expression: [${expressionId}]`);
    }

    if (motion != null) {
      this._expressionManager.startMotion(motion, false);
    } else {
      if (this._debugMode) {
        LAppPal.printMessage(`[APP]expression[${expressionId}] is null`);
      }
    }
  }

  /**
   * ランダムに選ばれた表情モーションをセットする
   */
  public setRandomExpression(): void {
    if (auditState.speaking) return;
    if (this._expressions.size == 0) {
      return;
    }

    const no: number = Math.floor(Math.random() * this._expressions.size);

    for (let i = 0; i < this._expressions.size; i++) {
      if (i == no) {
        // const name: string = this._expressions._keyValues[i].first;
        const expressionsArray = [...this._expressions.entries()];
        const name: string = expressionsArray[i][0];
        this.setExpression(name);
        return;
      }
    }
  }

  /**
   * イベントの発火を受け取る
   */
  public motionEventFired(eventValue: string): void {
    CubismLogInfo('{0} is fired on LAppModel!!', eventValue);
  }

  /**
   * 当たり判定テスト
   * 指定ＩＤの頂点リストから矩形を計算し、座標をが矩形範囲内か判定する。
   *
   * @param hitArenaName  当たり判定をテストする対象のID
   * @param x             判定を行うX座標
   * @param y             判定を行うY座標
   */
  public hitTest(hitArenaName: string, x: number, y: number): boolean {
    // 透明時は当たり判定無し。
    if (this._opacity < 1) {
      return false;
    }

    const count: number = this._modelSetting.getHitAreasCount();

    for (let i = 0; i < count; i++) {
      if (this._modelSetting.getHitAreaName(i) == hitArenaName) {
        const drawId: CubismIdHandle = this._modelSetting.getHitAreaId(i);
        return this.isHit(drawId, x, y);
      }
    }

    return false;
  }

  /**
   * モーションデータをグループ名から一括でロードする。
   * モーションデータの名前は内部でModelSettingから取得する。
   *
   * @param group モーションデータのグループ名
   */
  public preLoadMotionGroup(group: string): void {
    const count = this._modelSetting.getMotionCount(group);
    const preferred = [
      LAppDefine.PresentationIntroMotionIndex,
      ...LAppDefine.PresentationIdleMotionIndices
    ];
    const order = [
      ...preferred.filter((index, position) =>
        index >= 0 && index < count && preferred.indexOf(index) === position
      ),
      ...Array.from({ length: count }, (_, index) => index).filter(
        index => preferred.indexOf(index) < 0
      )
    ];

    const loadNext = (position: number): void => {
      if (position >= order.length) return;
      const schedule = (callback: () => void): void => {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(callback, { timeout: 500 });
        } else {
          setTimeout(callback, 16);
        }
      };
      schedule(() => {
        const continueLoading = (): void => {
          // Leave a real interaction window between parses. A single animation
          // frame was still too aggressive on slower machines and could make
          // a freshly focused textarea appear unresponsive for several seconds.
          window.requestAnimationFrame(() => {
            window.setTimeout(() => loadNext(position + 1), 160);
          });
        };
        this.preLoadMotion(group, order[position]).then(
          continueLoading,
          continueLoading
        );
      });
    };

    // Let the first live frame and UI focus settle before background work.
    window.setTimeout(() => loadNext(0), 250);
  }

  private preLoadMotion(group: string, i: number): Promise<void> {
      const motionFileName = this._modelSetting.getMotionFileName(group, i);

      // ex) idle_0
      const name = `${group}_${i}`;
      if (this._debugMode) {
        LAppPal.printMessage(
          `[APP]load motion: ${motionFileName} => [${name}]`
        );
      }

      return fetch(`${this._modelHomeDir}${motionFileName}`)
        .then(response => {
          if (response.ok) {
            return response.arrayBuffer();
          }
          throw new Error(`HTTP ${response.status}`);
        })
        .then(arrayBuffer => {
          const parseStartedAt = performance.now();
          const tmpMotion: CubismMotion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            name,
            null,
            null,
            this._modelSetting,
            group,
            i,
            this._motionConsistency
          );
          if (new URLSearchParams(location.search).has('input-audit')) {
            const previous = JSON.parse(
              document.documentElement.dataset.motionPreload || '[]'
            ) as Array<{ name: string; parseMs: number; completedAtMs: number }>;
            previous.push({
              name,
              parseMs: performance.now() - parseStartedAt,
              completedAtMs: performance.now()
            });
            document.documentElement.dataset.motionPreload = JSON.stringify(previous);
          }

          if (tmpMotion != null) {
            // The source assets are authored as loops. Presentation mode must
            // play each clip once so the original wave/beckon clips can enter
            // the sequence instead of the first motion running forever.
            tmpMotion.setLoop(false);
            tmpMotion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);

            if (this._motions.get(name) != null) {
              ACubismMotion.delete(this._motions.get(name));
            }

            this._motions.set(name, tmpMotion);

            this._motionCount++;
          } else {
            // loadMotionできなかった場合はモーションの総数がずれるので1つ減らす
            this._allMotionCount--;
          }

          if (this._motionCount >= this._allMotionCount) {
            markAvatarLoadStage('motionsLoaded');
          }
        })
        .catch(() => {
          CubismLogError(
            `Failed to load file ${this._modelHomeDir}${motionFileName}`
          );
          this._allMotionCount--;
          if (this._motionCount >= this._allMotionCount) {
            markAvatarLoadStage('motionsLoaded');
          }
        });
  }

  /**
   * すべてのモーションデータを解放する。
   */
  public releaseMotions(): void {
    this._motions.clear();
  }

  /**
   * 全ての表情データを解放する。
   */
  public releaseExpressions(): void {
    this._expressions.clear();
  }

  /**
   * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
   */
  public doDraw(): void {
    if (this._model == null) return;

    // キャンバスサイズを渡す
    const canvas = this._subdelegate.getCanvas();
    const viewport: number[] = [0, 0, canvas.width, canvas.height];

    this.getRenderer().setRenderState(
      this._subdelegate.getFrameBuffer(),
      viewport
    );
    this.getRenderer().drawModel(LAppDefine.ShaderPath);
  }

  /**
   * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
   */
  public draw(matrix: CubismMatrix44): void {
    if (this._model == null) {
      return;
    }

    // 各読み込み終了後
    if (this._state == LoadStep.CompleteSetup) {
      matrix.multiplyByMatrix(this._modelMatrix);

      this.getRenderer().setMvpMatrix(matrix);

      this.doDraw();
      markAvatarReady();
    }
  }

  public async hasMocConsistencyFromFile() {
    CSM_ASSERT(this._modelSetting.getModelFileName().localeCompare(``));

    // CubismModel
    if (this._modelSetting.getModelFileName() != '') {
      const modelFileName = this._modelSetting.getModelFileName();

      const response = await fetch(`${this._modelHomeDir}${modelFileName}`);
      const arrayBuffer = await response.arrayBuffer();

      this._consistency = CubismMoc.hasMocConsistency(arrayBuffer);

      if (!this._consistency) {
        CubismLogInfo('Inconsistent MOC3.');
      } else {
        CubismLogInfo('Consistent MOC3.');
      }

      return this._consistency;
    } else {
      LAppPal.printMessage('Model data does not exist.');
    }
  }

  public setSubdelegate(subdelegate: LAppSubdelegate): void {
    this._subdelegate = subdelegate;
  }

  /**
   * デストラクタに相当する処理のオーバーライド
   */
  public release(): void {
    if (this._look) {
      CubismLook.delete(this._look);
      this._look = null;
    }
    if (this._updateScheduler) {
      this._updateScheduler.release();
    }
    super.release();
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    super();

    this._modelSetting = null;
    this._modelHomeDir = null;
    this._userTimeSeconds = 0.0;

    this._eyeBlinkIds = new Array<CubismIdHandle>();
    this._lipSyncIds = new Array<CubismIdHandle>();

    this._motions = new Map<string, ACubismMotion>();
    this._expressions = new Map<string, ACubismMotion>();

    this._hitArea = new Array<csmRect>();
    this._userArea = new Array<csmRect>();

    this._idParamAngleX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleX
    );
    this._idParamAngleY = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleY
    );
    this._idParamAngleZ = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleZ
    );
    this._idParamBodyAngleX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamBodyAngleX
    );

    if (LAppDefine.MOCConsistencyValidationEnable) {
      this._mocConsistency = true;
    }

    if (LAppDefine.MotionConsistencyValidationEnable) {
      this._motionConsistency = true;
    }

    this._state = LoadStep.LoadAssets;
    this._expressionCount = 0;
    this._textureCount = 0;
    this._motionCount = 0;
    this._allMotionCount = 0;
    this._deferredMotionGroups = [];
    this._wavFileHandler = new LAppWavFileHandler();
    this._consistency = false;
    this._look = null;
    this._updateScheduler = new CubismUpdateScheduler();
    this._motionUpdated = false;
    this._presentationMotionIndex = -1;
    this._presenterModeActive = false;
    this._presenterExitActive = false;
    this._presenterExitElapsed = 0;
    this._idleNeutralCyclesRemaining = 1;
    this._idleActionCursor = 0;
    this._visibleArmFamilyB = false;
    this._targetArmFamilyB = false;
    this._armFamilyTransitionDuration = 0.72;
    this._armFamilyTransitionElapsed = this._armFamilyTransitionDuration;
    this._handShapeR = 0;
    this._handShapeL = 0;
    this._emotionBlendSmile = 0;
    this._emotionBlendSerious = 0;
    this._emotionBlendCurious = 0;
    this._emotionTarget = 'natural';
    this._emotionTransitionElapsed = 1;
    this._emotionTransitionStartedAt = performance.now() - 1000;
    this._emotionTransitionStartSmile = 0;
    this._emotionTransitionStartSerious = 0;
    this._emotionTransitionStartCurious = 0;
    this._speechMotionBlend = 0;
    this._emphasisMotionBlend = 0;
  }

  private _updateScheduler: CubismUpdateScheduler; // アップデートスケジューラー
  private _motionUpdated: boolean; // モーション更新フラグ
  private _presentationMotionIndex: number; // neutral authored presenter motion
  private _presenterModeActive: boolean;
  private _presenterExitActive: boolean;
  private _presenterExitElapsed: number;
  private _idleNeutralCyclesRemaining: number;
  private _idleActionCursor: number;
  private _visibleArmFamilyB: boolean;
  private _targetArmFamilyB: boolean;
  private _armFamilyTransitionElapsed: number;
  private _armFamilyTransitionDuration: number;
  private _handShapeR: number;
  private _handShapeL: number;
  private _emotionBlendSmile: number;
  private _emotionBlendSerious: number;
  private _emotionBlendCurious: number;
  private _emotionTarget: AuditEmotion;
  private _emotionTransitionElapsed: number;
  private _emotionTransitionStartedAt: number;
  private _emotionTransitionStartSmile: number;
  private _emotionTransitionStartSerious: number;
  private _emotionTransitionStartCurious: number;
  private _speechMotionBlend: number;
  private _emphasisMotionBlend: number;
  private _subdelegate: LAppSubdelegate; // サブデリゲート

  _modelSetting: ICubismModelSetting; // モデルセッティング情報
  _modelHomeDir: string; // モデルセッティングが置かれたディレクトリ
  _userTimeSeconds: number; // デルタ時間の積算値[秒]

  _eyeBlinkIds: Array<CubismIdHandle>; // モデルに設定された瞬き機能用パラメータID
  _lipSyncIds: Array<CubismIdHandle>; // モデルに設定されたリップシンク機能用パラメータID

  _motions: Map<string, ACubismMotion>; // 読み込まれているモーションのリスト
  _expressions: Map<string, ACubismMotion>; // 読み込まれている表情のリスト

  _hitArea: Array<csmRect>;
  _userArea: Array<csmRect>;

  _idParamAngleX: CubismIdHandle; // パラメータID: ParamAngleX
  _idParamAngleY: CubismIdHandle; // パラメータID: ParamAngleY
  _idParamAngleZ: CubismIdHandle; // パラメータID: ParamAngleZ
  _idParamBodyAngleX: CubismIdHandle; // パラメータID: ParamBodyAngleX

  _look: CubismLook; // ドラッグ追従

  _state: LoadStep; // 現在のステータス管理用
  _expressionCount: number; // 表情データカウント
  _textureCount: number; // テクスチャカウント
  _motionCount: number; // モーションデータカウント
  _allMotionCount: number; // モーション総数
  private _deferredMotionGroups: string[]; // first paint後に分割読み込みするモーション群
  _wavFileHandler: LAppWavFileHandler; //wavファイルハンドラ
  _consistency: boolean; // MOC3整合性チェック管理用
}
