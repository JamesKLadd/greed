export interface LoadedCharacterImage {
  src: string;
  width: number;
  height: number;
}

/** Keep the lightweight silhouette visible until the selected view has decoded. */
export function loadCharacterImage(
  src: string,
  ready: (image: LoadedCharacterImage | null) => void,
): () => void {
  let active = true;
  const image = new Image();
  image.decoding = "async";
  image.onload = async () => {
    try {
      if (typeof image.decode === "function") await image.decode();
      if (active) {
        ready(
          image.naturalWidth > 0 && image.naturalHeight > 0
            ? { src, width: image.naturalWidth, height: image.naturalHeight }
            : null,
        );
      }
    } catch {
      if (active) ready(null);
    }
  };
  image.onerror = () => {
    if (active) ready(null);
  };
  image.src = src;
  return () => {
    active = false;
    image.onload = null;
    image.onerror = null;
  };
}
