export function shouldAllowForcedPreloadFailure(isProduction: boolean): boolean {
  return !isProduction;
}

export function getForcedPreloadFailureKey(search: string, isProduction: boolean): string | null {
  if (!shouldAllowForcedPreloadFailure(isProduction)) {
    return null;
  }

  const queryParameter = ['preload', 'Fail', 'Asset'].join('');
  return new URLSearchParams(search).get(queryParameter);
}
