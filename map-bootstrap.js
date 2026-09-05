(() => {
  if (!window.L?.map || window.__langeMapBootstrapInstalled) return;
  window.__langeMapBootstrapInstalled = true;

  const originalMap = window.L.map;
  window.L.map = function patchedLeafletMap(...args) {
    const instance = originalMap.apply(this, args);
    const target = args[0];
    const isMainMap = target === 'map' || target?.id === 'map';
    if (isMainMap) {
      window.__langeMap = instance;
      window.dispatchEvent(new CustomEvent('lange-map-ready', { detail: { map: instance } }));
    }
    return instance;
  };
})();
