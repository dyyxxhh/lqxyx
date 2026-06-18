import 'phaser';

declare module 'phaser' {
  namespace Textures {
    interface TextureManager {
      generate(
        key: string,
        config: {
          data: string[];
          pixelWidth?: number;
          pixelHeight?: number;
          palette?: Record<string, string>;
        },
      ): Texture;
    }
  }
}
