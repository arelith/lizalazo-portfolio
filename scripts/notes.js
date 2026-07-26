/* ==========================================================================
   Прорисовка рукописных пометок
   Длина пути берётся из getTotalLength() — не хардкодится.

   Сценарии (атрибут data-draw):
     "view"  — пометка принадлежит блоку [data-notes]. Когда блок попадает
               во вьюпорт, пометки рисуются по очереди: пауза --notes-lead,
               затем шаг --notes-step в порядке data-order.
     "hover" — рисуется при наведении; на тач-устройствах, где наведения нет,
               рисуется при появлении во вьюпорте.

   Скрытое состояние ставится ЗДЕСЬ, а не в CSS: если скрипт не отработал,
   пометки остаются нарисованными.

   Работает только с обводкой (stroke) — у залитого контура нет линии.
   ========================================================================== */
(function initNoteDrawing() {
  const notes = document.querySelectorAll("[data-draw]");
  if (!notes.length) return;

  // При «уменьшить движение» ничего не прячем — пометки сразу нарисованы
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canHover = window.matchMedia("(hover: hover)").matches;

  /* Секунды из значения токена: "0.12s" / "120ms" → 0.12 */
  function seconds(value) {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return 0;
    return /ms\s*$/.test(value) ? n / 1000 : n;
  }

  /* Шаг между штрихами. У длинных надписей базовый шаг даёт слишком долгую
     анимацию (18 штрихов × 0.12с = 2.6с), поэтому сжимаем его так, чтобы
     уложиться в --note-draw-budget. Короткие пометки шаг не трогает. */
  function staggerFor(note, count) {
    if (count < 2) return 0;
    const styles = getComputedStyle(note);
    const base = seconds(styles.getPropertyValue("--note-draw-stagger"));
    const duration = seconds(styles.getPropertyValue("--note-draw-duration"));
    const budget = seconds(styles.getPropertyValue("--note-draw-budget"));
    if (!budget) return base;
    return Math.min(base, Math.max(0, budget - duration) / (count - 1));
  }

  /* Прячем линию. Значения ставим инлайново, а переход на время подготовки
     выключаем — иначе браузер анимировал бы само «стирание» при загрузке. */
  function prepare(note) {
    const paths = [...note.querySelectorAll("path")];
    if (!paths.length) return false;

    let prepared = false;
    paths.forEach((path) => {
      const length = path.getTotalLength();
      if (!length) return;
      path.style.transition = "none";
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
      path.dataset.drawLength = length;
      prepared = true;
    });
    if (!prepared) return false;

    note.__strokeStep = staggerFor(note, paths.length);
    note.getBoundingClientRect(); // применяем скрытие до включения перехода
    paths.forEach((path) => {
      path.style.transition = "";
    });
    return true;
  }

  /* Рисуем. lead — задержка перед стартом самой пометки; штрихи внутри
     разложены поверх неё, поэтому вся последовательность живёт на
     transition-delay и не зависит от таймеров. */
  function draw(note, lead = 0) {
    const step = note.__strokeStep || 0;
    note.querySelectorAll("path").forEach((path, i) => {
      if (path.dataset.drawLength === undefined) return;
      const delay = lead + step * i;
      path.style.setProperty("--note-draw-delay", `${delay.toFixed(3)}s`);
      path.style.strokeDashoffset = "0";
    });
  }

  function hide(note) {
    note.querySelectorAll("path").forEach((path) => {
      if (path.dataset.drawLength === undefined) return;
      path.style.setProperty("--note-draw-delay", "0s");
      path.style.strokeDashoffset = path.dataset.drawLength;
    });
  }

  /* --- Раскладываем пометки по блокам --- */
  const blocks = new Map(); // [data-notes] → [пометки]
  const hoverNotes = [];

  notes.forEach((note) => {
    if (!prepare(note)) return;
    if (note.dataset.draw === "hover") {
      hoverNotes.push(note);
      return;
    }
    const block = note.closest("[data-notes]") || note.parentElement;
    if (!blocks.has(block)) blocks.set(block, []);
    blocks.get(block).push(note);
  });

  blocks.forEach((items) => items.forEach((n, i) => (n.__domIndex = i)));

  /* Левый край пометки. Пометки позиционируются абсолютно через --note-x,
     поэтому порядок в DOM не совпадает с порядком на экране.
     Скрытые на этой ширине (нулевой прямоугольник) уходят в конец, чтобы
     не занимать шаг перед видимыми. */
  const FAR_RIGHT = Number.MAX_SAFE_INTEGER; // не Infinity: Infinity - Infinity = NaN

  function left(note) {
    const rect = note.getBoundingClientRect();
    if (!rect.width && !rect.height) return FAR_RIGHT; // скрыта на этой ширине — в конец
    return rect.left;
  }

  /* Порядок внутри блока: сначала data-order, потом — порядок в DOM.

     Если блок лежит внутри [data-notes-order="x"], вместо порядка в DOM
     берётся горизонтальный: пометки позиционируются абсолютно через --note-x,
     и в двухколоночных блоках порядок в разметке не совпадает с тем, что
     видит глаз. Там, где пометки идут вертикальной колонкой (STAR в Бакки),
     порядок в DOM как раз правильный — поэтому это включается точечно.

     Считаем на запуске, а не при загрузке: к этому моменту раскладка
     окончательная. */
  function ordered(items, block) {
    const byX = !!block.closest('[data-notes-order="x"]');
    const x = byX ? new Map(items.map((note) => [note, left(note)])) : null;
    return [...items].sort(
      (a, b) =>
        (parseFloat(a.dataset.order) || 0) - (parseFloat(b.dataset.order) || 0) ||
        (byX ? x.get(a) - x.get(b) : 0) ||
        a.__domIndex - b.__domIndex
    );
  }

  /* --- Запуск блока: пауза, затем пометки по очереди ---
     offset — сколько ещё проявляется контент под пометками (reveal.js). */
  function runBlock(block, offset = 0) {
    const stored = blocks.get(block);
    if (!stored) return;
    const items = ordered(stored, block);
    const styles = getComputedStyle(block);
    const pause = offset
      ? seconds(styles.getPropertyValue("--notes-lead-reveal"))
      : seconds(styles.getPropertyValue("--notes-lead"));
    const lead = offset + pause;
    const step = seconds(styles.getPropertyValue("--notes-step"));
    items.forEach((note, i) => draw(note, lead + step * i));
  }

  /* Сначала контент, потом пометки: если блок ещё ждёт проявления,
     ждём события reveal и только после него отсчитываем свою паузу.
     Нет reveal.js (или «уменьшить движение») — метки нет, идём сразу. */
  function startBlock(block) {
    const pending = block.closest("[data-reveal-pending]");
    if (!pending) {
      runBlock(block);
      return;
    }
    pending.addEventListener(
      "reveal",
      (event) => runBlock(block, (event.detail && event.detail.tail) || 0),
      { once: true }
    );
  }

  /* Один раз при появлении. Элементы первого экрана отдаются
     в первом же колбэке — скролл не нужен. */
  function observeOnce(items, onEnter) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          onEnter(entry.target);
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.15 }
    );
    items.forEach((el) => observer.observe(el));
  }

  if (blocks.size) observeOnce([...blocks.keys()], startBlock);

  /* --- Пометки по наведению --- */
  if (hoverNotes.length) {
    if (canHover) {
      hoverNotes.forEach((note) => {
        // слушаем интерактивного родителя: у самой пометки pointer-events: none
        const trigger = note.closest("a, button") || note.parentElement;
        if (!trigger) return;
        trigger.addEventListener("mouseenter", () => draw(note));
        trigger.addEventListener("mouseleave", () => hide(note));
      });
    } else {
      observeOnce(hoverNotes, (note) => draw(note));
    }
  }
})();
