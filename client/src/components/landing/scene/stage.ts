import type { Group } from "three";

/** One stage of the 3D scene that the camera visits while the sections scroll by. */
export interface Stage {
  group: Group;
  /**
   * Moves the stage's animation along.
   *
   * @param presence 1 while the camera rests on this stage, 0 once it's far away.
   * @param time Seconds since the scene started.
   * @param dt Seconds since the last frame.
   * @param still True when the visitor prefers reduced motion: no idle movement.
   */
  update(presence: number, time: number, dt: number, still: boolean): void;
  dispose(): void;
}
