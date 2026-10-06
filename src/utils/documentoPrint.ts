export const printHtml = async (html: string) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(frame);
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  if (!frameDocument || !frameWindow) {
    frame.remove();
    throw new Error("No se pudo preparar el documento para imprimir");
  }
  try {
    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();
    await Promise.all(
      Array.from(frameDocument.images).map((image) =>
        new Promise<void>((resolve) => {
          if (image.complete) return resolve();
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
      ),
    );
    await frameDocument.fonts?.ready;
    frameWindow.addEventListener(
      "afterprint",
      () => window.setTimeout(() => frame.remove(), 500),
      { once: true },
    );
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => {
      if (frame.isConnected) frame.remove();
    }, 60_000);
  } catch (error) {
    frame.remove();
    throw error;
  }
};
