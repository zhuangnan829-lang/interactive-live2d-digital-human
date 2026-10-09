/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { LAppGlManager } from './lappglmanager';
import { markAvatarLoadError } from './auditstate';

/**
 * テクスチャ管理クラス
 * 画像読み込み、管理を行うクラス。
 */
export class LAppTextureManager {
  /**
   * コンストラクタ
   */
  public constructor() {
    this._textures = new Array<TextureInfo>();
  }

  /**
   * 解放する。
   */
  public release(): void {
    for (let i = 0; i < this._textures.length; i++) {
      this._glManager.getGl().deleteTexture(this._textures[i].id);
    }
    this._textures = null;
  }

  /**
   * 画像読み込み
   *
   * @param fileName 読み込む画像ファイルパス名
   * @param usePremultiply Premult処理を有効にするか
   * @return 画像情報、読み込み失敗時はnullを返す
   */
  public createTextureFromPngFile(
    fileName: string,
    usePremultiply: boolean,
    callback: (textureInfo: TextureInfo) => void
  ): void {
    const textureStartedAt = performance.now();
    const textureTiming: Record<string, number | string> = {
      file: fileName.split('/').pop() || fileName,
      requestedMs: Number(textureStartedAt.toFixed(1))
    };
    const publishTiming = (): void => {
      const current = JSON.parse(
        document.documentElement.dataset.textureDecode || '[]'
      ) as Array<Record<string, number | string>>;
      const index = current.findIndex(item => item.file === textureTiming.file);
      if (index >= 0) current[index] = { ...textureTiming };
      else current.push({ ...textureTiming });
      document.documentElement.dataset.textureDecode = JSON.stringify(current);
    };
    publishTiming();
    // search loaded texture already
    for (let i = 0; i < this._textures.length; i++) {
      if (
        this._textures[i].fileName == fileName &&
        this._textures[i].usePremultply == usePremultiply
      ) {
        callback(this._textures[i]);
        return;
      }
    }

    const uploadTexture = (
      source: TexImageSource | Uint8Array,
      width: number,
      height: number,
      retainedSource: HTMLImageElement | ImageBitmap | Uint8Array
    ): void => {
        textureTiming.decodeDoneMs = Number(performance.now().toFixed(1));
        // テクスチャオブジェクトの作成
        const tex: WebGLTexture = this._glManager.getGl().createTexture();

        // テクスチャを選択
        this._glManager
          .getGl()
          .bindTexture(this._glManager.getGl().TEXTURE_2D, tex);

        // テクスチャにピクセルを書き込む
        this._glManager
          .getGl()
          .texParameteri(
            this._glManager.getGl().TEXTURE_2D,
            this._glManager.getGl().TEXTURE_MIN_FILTER,
            this._glManager.getGl().LINEAR_MIPMAP_LINEAR
          );
        this._glManager
          .getGl()
          .texParameteri(
            this._glManager.getGl().TEXTURE_2D,
            this._glManager.getGl().TEXTURE_MAG_FILTER,
            this._glManager.getGl().LINEAR
          );

        // Premult処理を行わせる
        const isRawPixels = source instanceof Uint8Array;
        if (usePremultiply && !isRawPixels) {
          this._glManager
            .getGl()
            .pixelStorei(
              this._glManager.getGl().UNPACK_PREMULTIPLY_ALPHA_WEBGL,
              1
            );
        }

        // テクスチャにピクセルを書き込む
        const gl = this._glManager.getGl();
        if (isRawPixels) {
          // RGBA assets are premultiplied offline and need no browser image
          // decode. This avoids Chromium's occasionally multi-second image
          // decoder queue while preserving exactly the same model artwork.
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            width,
            height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            source
          );
        } else {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            source
          );
        }

        // ミップマップを生成
        this._glManager
          .getGl()
          .generateMipmap(this._glManager.getGl().TEXTURE_2D);
        textureTiming.uploadDoneMs = Number(performance.now().toFixed(1));
        textureTiming.totalMs = Number(
          (performance.now() - textureStartedAt).toFixed(1)
        );
        publishTiming();

        // テクスチャをバインド
        this._glManager
          .getGl()
          .bindTexture(this._glManager.getGl().TEXTURE_2D, null);

        const textureInfo: TextureInfo = new TextureInfo();
        if (textureInfo != null) {
          textureInfo.fileName = fileName;
          textureInfo.width = width;
          textureInfo.height = height;
          textureInfo.id = tex;
          textureInfo.img = retainedSource;
          textureInfo.usePremultply = usePremultiply;
          if (this._textures != null) {
            this._textures.push(textureInfo);
          }
        }

        callback(textureInfo);
    };

    const loadWithImageElement = (): void => {
      const img = new Image();
      img.fetchPriority = 'high';
      // These are small, eagerly preloaded presentation textures. Sync decode
      // avoids Chromium occasionally parking one of two concurrent
      // createImageBitmap jobs for several seconds.
      img.decoding = 'sync';
      textureTiming.path = 'image-sync';
      img.addEventListener(
        'load',
        (): void => {
          uploadTexture(img, img.width, img.height, img);
        },
        { passive: true }
      );
      img.addEventListener(
        'error',
        (): void => {
          const message = `人物纹理加载失败：${fileName.split('/').pop() || fileName}`;
          textureTiming.error = message;
          publishTiming();
          markAvatarLoadError(message);
        },
        { once: true }
      );
      img.src = fileName;
    };

    if (fileName.endsWith('.rgba.gz') && 'DecompressionStream' in window) {
      textureTiming.path = 'raw-rgba-gzip';
      fetch(fileName, { cache: 'force-cache', priority: 'high' })
        .then(response => {
          if (!response.ok || !response.body) {
            throw new Error(`Texture HTTP ${response.status}`);
          }
          textureTiming.responseMs = Number(performance.now().toFixed(1));
          // Vite serves .gz assets with Content-Encoding: gzip, so fetch has
          // already produced the decompressed RGBA bytes. Static hosts may
          // serve the same file as application/gzip; handle both forms.
          if (response.headers.get('content-encoding') === 'gzip') {
            return response.arrayBuffer();
          }
          return new Response(
            response.body.pipeThrough(new DecompressionStream('gzip'))
          ).arrayBuffer();
        })
        .then(buffer => {
          textureTiming.blobMs = Number(performance.now().toFixed(1));
          const view = new DataView(buffer, 0, 8);
          const width = view.getUint32(0, true);
          const height = view.getUint32(4, true);
          const pixels = new Uint8Array(buffer, 8);
          if (pixels.byteLength !== width * height * 4) {
            throw new Error('Invalid raw RGBA texture length');
          }
          uploadTexture(pixels, width, height, pixels);
        })
        .catch(() => {
          fileName = fileName.replace(/\.rgba\.gz$/, '.png');
          loadWithImageElement();
        });
      return;
    }

    loadWithImageElement();
  }

  /**
   * 画像の解放
   *
   * 配列に存在する画像全てを解放する。
   */
  public releaseTextures(): void {
    for (let i = 0; i < this._textures.length; i++) {
      this._glManager.getGl().deleteTexture(this._textures[i].id);
      this._textures[i] = null;
    }

    this._textures.length = 0;
  }

  /**
   * 画像の解放
   *
   * 指定したテクスチャの画像を解放する。
   * @param texture 解放するテクスチャ
   */
  public releaseTextureByTexture(texture: WebGLTexture): void {
    for (let i = 0; i < this._textures.length; i++) {
      if (this._textures[i].id != texture) {
        continue;
      }

      this._glManager.getGl().deleteTexture(this._textures[i].id);
      this._textures[i] = null;
      this._textures.splice(i, 1);
      break;
    }
  }

  /**
   * 画像の解放
   *
   * 指定した名前の画像を解放する。
   * @param fileName 解放する画像ファイルパス名
   */
  public releaseTextureByFilePath(fileName: string): void {
    for (let i = 0; i < this._textures.length; i++) {
      if (this._textures[i].fileName == fileName) {
        this._glManager.getGl().deleteTexture(this._textures[i].id);
        this._textures[i] = null;
        this._textures.splice(i, 1);
        break;
      }
    }
  }

  /**
   * setter
   * @param glManager
   */
  public setGlManager(glManager: LAppGlManager): void {
    this._glManager = glManager;
  }

  _textures: Array<TextureInfo>;
  private _glManager: LAppGlManager;
}

/**
 * 画像情報構造体
 */
export class TextureInfo {
  img: HTMLImageElement | ImageBitmap | Uint8Array; // 画像
  id: WebGLTexture = null; // テクスチャ
  width = 0; // 横幅
  height = 0; // 高さ
  usePremultply: boolean; // Premult処理を有効にするか
  fileName: string; // ファイル名
}
