/** A dependency-free dual-handle range slider over an integer index domain
 * [min, max]. Drag either thumb to resize the window, or drag the highlighted
 * bar between them to pan the whole window (same width) to a different period. */
export interface DualRangeSlider {
  setRange(start: number, end: number): void;
}

export interface DualRangeSliderOptions {
  min: number;
  max: number;
  start: number;
  end: number;
  onChange(start: number, end: number): void;
  /** formats an index into a human label, e.g. for aria-valuetext */
  formatIndex(index: number): string;
}

export function createDualRangeSlider(container: HTMLElement, opts: DualRangeSliderOptions): DualRangeSlider {
  const { min, max } = opts;
  let start = opts.start;
  let end = opts.end;

  container.innerHTML = `
    <div class="range-slider-track">
      <div class="range-slider-selected"></div>
      <div class="range-slider-thumb" data-thumb="start" tabindex="0" role="slider"
        aria-label="Range start" aria-valuemin="${min}" aria-valuemax="${max}"></div>
      <div class="range-slider-thumb" data-thumb="end" tabindex="0" role="slider"
        aria-label="Range end" aria-valuemin="${min}" aria-valuemax="${max}"></div>
    </div>
  `;

  const track = container.querySelector<HTMLDivElement>(".range-slider-track")!;
  const selected = container.querySelector<HTMLDivElement>(".range-slider-selected")!;
  const startThumb = container.querySelector<HTMLDivElement>('[data-thumb="start"]')!;
  const endThumb = container.querySelector<HTMLDivElement>('[data-thumb="end"]')!;

  const pct = (v: number): number => ((v - min) / (max - min)) * 100;

  function render(): void {
    startThumb.style.left = `${pct(start)}%`;
    endThumb.style.left = `${pct(end)}%`;
    selected.style.left = `${pct(start)}%`;
    selected.style.width = `${pct(end) - pct(start)}%`;
    startThumb.setAttribute("aria-valuenow", String(start));
    startThumb.setAttribute("aria-valuetext", opts.formatIndex(start));
    endThumb.setAttribute("aria-valuenow", String(end));
    endThumb.setAttribute("aria-valuetext", opts.formatIndex(end));
  }

  function indexFromClientX(clientX: number): number {
    const rect = track.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(min + frac * (max - min));
  }

  function trackPointerDrag(onMove: (clientX: number) => void): (downEvent: PointerEvent) => void {
    return (downEvent) => {
      downEvent.preventDefault();
      const move = (e: PointerEvent) => onMove(e.clientX);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      onMove(downEvent.clientX);
    };
  }

  startThumb.addEventListener(
    "pointerdown",
    trackPointerDrag((clientX) => {
      start = Math.min(indexFromClientX(clientX), end);
      render();
      opts.onChange(start, end);
    })
  );

  endThumb.addEventListener(
    "pointerdown",
    trackPointerDrag((clientX) => {
      end = Math.max(indexFromClientX(clientX), start);
      render();
      opts.onChange(start, end);
    })
  );

  selected.addEventListener("pointerdown", (downEvent) => {
    downEvent.preventDefault();
    const rect = track.getBoundingClientRect();
    const startX = downEvent.clientX;
    const initialStart = start;
    const initialEnd = end;
    const span = end - start;
    const move = (e: PointerEvent) => {
      const deltaIdx = Math.round(((e.clientX - startX) / rect.width) * (max - min));
      let newStart = initialStart + deltaIdx;
      let newEnd = initialEnd + deltaIdx;
      if (newStart < min) {
        newStart = min;
        newEnd = min + span;
      }
      if (newEnd > max) {
        newEnd = max;
        newStart = max - span;
      }
      start = newStart;
      end = newEnd;
      render();
      opts.onChange(start, end);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  function keyHandler(which: "start" | "end"): (e: KeyboardEvent) => void {
    return (e) => {
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (!delta) return;
      e.preventDefault();
      if (which === "start") start = Math.min(Math.max(min, start + delta), end);
      else end = Math.max(Math.min(max, end + delta), start);
      render();
      opts.onChange(start, end);
    };
  }
  startThumb.addEventListener("keydown", keyHandler("start"));
  endThumb.addEventListener("keydown", keyHandler("end"));

  render();

  return {
    setRange(newStart: number, newEnd: number) {
      start = newStart;
      end = newEnd;
      render();
    },
  };
}
