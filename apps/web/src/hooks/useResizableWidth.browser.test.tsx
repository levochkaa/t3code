import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "./useResizableWidth";

const STORAGE_KEY = "t3code:test:resizable-width";
const OTHER_STORAGE_KEY = `${STORAGE_KEY}:other`;
const FRESH_STORAGE_KEY = `${STORAGE_KEY}:fresh`;
const LAST_USED_STORAGE_KEY = `${STORAGE_KEY}:last-used`;

function Probe(props: { storageKey?: string; maxWidth?: number }) {
  const { width, handlers } = useResizableWidth({
    storageKey: props.storageKey ?? STORAGE_KEY,
    lastUsedStorageKey: LAST_USED_STORAGE_KEY,
    defaultWidth: 400,
    minWidth: 300,
    maxWidth: props.maxWidth ?? 800,
    edge: "left",
  });
  return (
    <div>
      <output>{width}</output>
      <div role="separator" {...handlers} />
    </div>
  );
}

function dragLeftBy(handle: Element, distance: number) {
  const init = { bubbles: true, button: 0, pointerId: 1 };
  handle.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: 500 }));
  handle.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: 500 - distance }));
  handle.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: 500 - distance }));
}

function clearStoredWidths() {
  return {
    [Symbol.dispose]: () => {
      for (const key of [
        STORAGE_KEY,
        OTHER_STORAGE_KEY,
        FRESH_STORAGE_KEY,
        LAST_USED_STORAGE_KEY,
      ]) {
        localStorage.removeItem(key);
      }
    },
  };
}

describe("useResizableWidth", () => {
  it("opens at the last used width until a key has its own", async () => {
    using _storage = clearStoredWidths();
    localStorage.setItem(LAST_USED_STORAGE_KEY, "600");
    localStorage.setItem(OTHER_STORAGE_KEY, "450");
    await using screen = await render(<Probe />, {
      // A bare hook probe; nothing here navigates.
      router: false,
    });
    await expect.element(screen.getByText("600")).toBeInTheDocument();

    // Synthetic pointer ids are not active pointers, so the browser would reject capture.
    using _capture = vi
      .spyOn(HTMLElement.prototype, "setPointerCapture")
      .mockImplementation(() => {});
    await act(() => dragLeftBy(screen.getByRole("separator").element(), 100));
    await expect.element(screen.getByText("700")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("700");
    expect(localStorage.getItem(LAST_USED_STORAGE_KEY)).toBe("700");

    await screen.rerender(<Probe storageKey={OTHER_STORAGE_KEY} />);
    await expect.element(screen.getByText("450")).toBeInTheDocument();

    await screen.rerender(<Probe storageKey={FRESH_STORAGE_KEY} />);
    await expect.element(screen.getByText("700")).toBeInTheDocument();
  });

  it("saves nothing when the handle is only clicked", async () => {
    using _storage = clearStoredWidths();
    // Wider than this window allows, as a width saved on a bigger monitor would be.
    localStorage.setItem(LAST_USED_STORAGE_KEY, "1000");
    await using screen = await render(<Probe />, {
      // A bare hook probe; nothing here navigates.
      router: false,
    });
    await expect.element(screen.getByText("800")).toBeInTheDocument();

    // Synthetic pointer ids are not active pointers, so the browser would reject capture.
    using _capture = vi
      .spyOn(HTMLElement.prototype, "setPointerCapture")
      .mockImplementation(() => {});
    const handle = screen.getByRole("separator").element();
    await act(() => dragLeftBy(handle, 0));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LAST_USED_STORAGE_KEY)).toBe("1000");

    // A nudge under the drag threshold must not leave the panel off by its distance.
    await act(() => dragLeftBy(handle, -2));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(handle.parentElement?.style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY)).toBe("800px");

    // Bounds that shrink under a held handle must survive the release.
    const init = { bubbles: true, button: 0, pointerId: 1, clientX: 500 };
    handle.dispatchEvent(new PointerEvent("pointerdown", init));
    await screen.rerender(<Probe maxWidth={600} />);
    await act(() => {
      handle.dispatchEvent(new PointerEvent("pointerup", init));
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(handle.parentElement?.style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY)).toBe("600px");
  });
});
