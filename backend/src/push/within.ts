/** Gives up on `work` after `ms` without cancelling it; a slow service must not hold the caller's request open. */
export const within = async <T>(work: Promise<T>, ms: number): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
