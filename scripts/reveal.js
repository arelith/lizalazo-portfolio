/* ==========================================================================
   Проявление контента при скролле
     [data-reveal]        — элемент проявляется, когда попадает во вьюпорт
     [data-reveal-group]  — контейнер: его дочерние [data-reveal] проявляются
                            вместе, со стаггером друг за другом

   Скрытое состояние навешивается ЗДЕСЬ, а не в CSS: если скрипт не отработал,
   контент остаётся видимым. Тайминги — в токенах (--reveal-*).
   ========================================================================== */
(function initReveal() {
  // Предохранитель от мигания: <head> пометил <html> классом reveal-init,
  // и до нас контент уже спрятан из CSS. Снимаем класс, как только сами
  // расставим скрытие (или если прятать нечего) — иначе контент застрянет.
  const disarm = () =>
    document.documentElement.classList.remove("reveal-init");

  const groups = [...document.querySelectorAll("[data-reveal-group]")];
  const singles = [...document.querySelectorAll("[data-reveal]")].filter(
    (el) => !el.closest("[data-reveal-group]")
  );
  if (!groups.length && !singles.length) return disarm();

  // При «уменьшить движение» ничего не прячем — контент просто виден
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return disarm();

  const seconds = (value) => {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return 0;
    return /ms\s*$/.test(value) ? n / 1000 : n;
  };

  /* Прячем без перехода: сначала выключаем transition, чтобы браузер
     не анимировал само скрытие, потом возвращаем.

     data-reveal-pending — метка «ещё не проявился». По ней рукописные
     пометки (notes.js) понимают, что им надо дождаться контента. */
  function hide(el) {
    el.style.transition = "none";
    el.classList.add("is-hidden");
    el.dataset.revealPending = "";
    el.getBoundingClientRect();
    el.style.transition = "";
  }

  /* Показываем и сообщаем событием, сколько ещё длится проявление:
     tail = задержка + длительность перехода. notes.js добавляет это
     к своей паузе, чтобы пометки рисовались уже поверх видимого блока. */
  function show(el) {
    const styles = getComputedStyle(el);
    const tail =
      seconds(styles.transitionDelay.split(",")[0]) +
      seconds(styles.transitionDuration.split(",")[0]);

    el.classList.remove("is-hidden");
    delete el.dataset.revealPending;
    /* Событие не всплывает: слушатель вешается ровно на тот элемент,
       которого ждут (см. closest("[data-reveal-pending]") в notes.js). */
    el.dispatchEvent(new CustomEvent("reveal", { detail: { tail } }));
    return tail;
  }

  /* Готовим: группа получает стаггер по порядку своих элементов */
  const targets = [];

  groups.forEach((group) => {
    const items = [...group.querySelectorAll("[data-reveal]")];
    if (!items.length) return;
    const step = seconds(
      getComputedStyle(group).getPropertyValue("--reveal-stagger")
    );
    items.forEach((el, i) => {
      hide(el);
      if (i > 0) el.style.setProperty("--reveal-delay", `${(step * i).toFixed(3)}s`);
    });
    /* Сама группа тоже помечается ждущей: пометки, которые лежат прямо
       в контейнере, а не внутри её элементов, ждут проявления всей группы. */
    group.dataset.revealPending = "";
    targets.push({ trigger: group, items, group });
  });

  singles.forEach((el) => {
    hide(el);
    targets.push({ trigger: el, items: [el] });
  });

  // Всё спрятано через .is-hidden — снимаем предохранитель. Дальше скрытием
  // управляет .is-hidden, лишнего показа (мигания) уже не будет.
  disarm();

  /* Один раз при появлении. Элементы первого экрана сработают сразу:
     IntersectionObserver отдаёт их в первом же колбэке, скролл не нужен. */
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const found = targets.find((t) => t.trigger === entry.target);
        if (found) {
          // tail группы — по последнему элементу: он проявляется дольше всех
          const tails = found.items.map(show);
          if (found.group) {
            delete found.group.dataset.revealPending;
            found.group.dispatchEvent(
              new CustomEvent("reveal", {
                detail: { tail: Math.max(...tails) },
              })
            );
          }
        }
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach((t) => observer.observe(t.trigger));
})();
