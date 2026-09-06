export function botRoute(url: URL, mapping: Record<string, string>) {
  const address = url.host + url.pathname;
  for (const [prefix, destination] of Object.entries(mapping).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    if (address !== prefix && !address.startsWith(prefix + "/")) continue;
    const target = new URL(destination);
    const websocket = url.protocol === "ws:" || url.protocol === "wss:";
    target.protocol = websocket
      ? target.protocol === "https:"
        ? "wss:"
        : "ws:"
      : target.protocol;
    target.pathname =
      target.pathname.replace(/\/$/, "") + address.slice(prefix.length);
    target.search = url.search;
    return target.toString();
  }
  return url.toString();
}
