/* =============================================
   NAVBAR — glass effect on scroll
   ============================================= */
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;

  function updateNav() {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();
})();

/* =============================================
   SCROLL ANIMATIONS — IntersectionObserver
   ============================================= */
(function () {
  const els = document.querySelectorAll('.animate-in');
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -36px 0px' }
  );

  // Stagger siblings in the same parent
  const groups = new Map();
  els.forEach((el) => {
    const parent = el.parentElement;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(el);
  });

  groups.forEach((siblings) => {
    siblings.forEach((el, i) => {
      el.style.transitionDelay = `${i * 80}ms`;
    });
  });

  els.forEach((el) => observer.observe(el));
})();

/* =============================================
   SERVER CARDS — stagger animation delay
   ============================================= */
(function () {
  const cards = document.querySelectorAll('.server-card[data-index]');
  cards.forEach((card) => {
    const i = parseInt(card.dataset.index, 10) || 0;
    card.style.animationDelay = `${i * 65}ms`;
  });
})();

/* =============================================
   PAGE TRANSITION — fade in on load
   ============================================= */
(function () {
  document.documentElement.style.opacity = '0';
  document.documentElement.style.transition = 'opacity 0.35s ease';

  window.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(() => {
      document.documentElement.style.opacity = '1';
    });
  });

  // If DOMContentLoaded already fired (inline scripts)
  if (document.readyState !== 'loading') {
    requestAnimationFrame(() => {
      document.documentElement.style.opacity = '1';
    });
  }
})();

/* =============================================
   SMOOTH LINK TRANSITIONS
   ============================================= */
(function () {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    // Only animate same-origin, non-anchor internal links
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('http') ||
      href.startsWith('mailto') ||
      link.target === '_blank'
    ) return;

    e.preventDefault();
    document.documentElement.style.opacity = '0';

    setTimeout(() => {
      window.location.href = href;
    }, 280);
  });
})();
