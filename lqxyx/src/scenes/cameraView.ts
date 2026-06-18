export interface CameraViewportSource {
  scrollX: number;
  scrollY: number;
  displayWidth: number;
  displayHeight: number;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isRectInCameraView(camera: CameraViewportSource, rect: WorldRect): boolean {
  const viewX = camera.scrollX;
  const viewY = camera.scrollY;
  const viewRight = viewX + camera.displayWidth;
  const viewBottom = viewY + camera.displayHeight;

  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;

  return rect.x < viewRight && rectRight > viewX && rect.y < viewBottom && rectBottom > viewY;
}
