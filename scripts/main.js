/* main.js — точка входа. */

document.documentElement.classList.add("js");

/* ============================ Мобильное меню ============================
   Бургер открывает панель, крестик / затемнение / Esc — закрывают.
   Пока меню открыто, страница под ним не прокручивается.
   ---------------------------------------------------------------------- */
(function initMobileMenu() {
  const burger = document.querySelector(".burger");
  const nav = document.querySelector(".site-nav");
  const scrim = document.querySelector(".site-nav__scrim");
  const closeButton = document.querySelector(".site-nav__close");

  if (!burger || !nav || !scrim) return;

  function setMenu(isOpen) {
    nav.classList.toggle("is-open", isOpen);
    scrim.classList.toggle("is-open", isOpen);
    document.body.classList.toggle("is-menu-open", isOpen);
    burger.setAttribute("aria-expanded", String(isOpen));

    // Возвращаем фокус на понятный элемент
    if (isOpen && closeButton) {
      closeButton.focus();
    } else if (!isOpen) {
      burger.focus();
    }
  }

  burger.addEventListener("click", () => setMenu(true));
  scrim.addEventListener("click", () => setMenu(false));
  if (closeButton) {
    closeButton.addEventListener("click", () => setMenu(false));
  }

  // Тап по пункту — закрываем меню и уходим по якорю
  nav.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setMenu(false);
    }
  });

  // Если увели окно на десктоп — сбрасываем открытое состояние
  const desktopQuery = window.matchMedia("(min-width: 769px)");
  desktopQuery.addEventListener("change", (event) => {
    if (event.matches) setMenu(false);
  });
})();
