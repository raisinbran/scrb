/**
 * A clip borrows the backend's one playback session, whose position events are meant for the
 * shared player. While any clip holds the session those events are not the shared player's.
 */
let open = 0;

export const clipSessionOpen = (): boolean => open > 0;
export const openClipSession = (): void => {
  open += 1;
};
export const closeClipSession = (): void => {
  open = Math.max(0, open - 1);
};
