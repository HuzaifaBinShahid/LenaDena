import { createContext, useContext } from "react";

/**
 * True while a full-screen security overlay (the app lock) covers the app. Native `Modal`s render in their
 * own window above every in-app view, so modal primitives read this to hide themselves behind the lock.
 */
export const ScreenObscuredContext = createContext(false);

export function useScreenObscured() {
  return useContext(ScreenObscuredContext);
}
