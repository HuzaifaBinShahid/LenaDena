import { router } from "expo-router";

/** Clears the stack so Back cannot return to screens that belonged to the signed-out account. */
export function goToSignIn() {
  if (router.canDismiss()) router.dismissAll();
  router.replace("/auth");
}
