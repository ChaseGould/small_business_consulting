(function () {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  const yearEl = document.getElementById('year');
  const backToTop = document.querySelector('.back-to-top');

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('open');
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', 'Open menu');
      });
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#') {
        return;
      }
      const target = document.querySelector(targetId);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 320);
    });

    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Header gains a border/shadow once the page is scrolled.
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Scroll-reveal: fade/slide elements in as they enter the viewport.
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const revealTargets = document.querySelectorAll(
    '.hero-grid > *, .card, .step-card, .faq-list details, .cta-box, .section > .container > h2, .section > .container > .section-intro, .demo-form, .demo-output'
  );

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach((el) => el.classList.add('reveal', 'is-visible'));
  } else {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    revealTargets.forEach((el) => el.classList.add('reveal'));
    revealTargets.forEach((el) => {
      // Stagger siblings inside the same grid for a cascade effect.
      const siblings = Array.from(el.parentElement.children).filter((c) =>
        c.classList.contains('reveal')
      );
      const index = siblings.indexOf(el);
      if (index > 0 && index < 4) {
        el.setAttribute('data-reveal-delay', String(index));
      }
      observer.observe(el);
    });
  }

  const form = document.getElementById('contact-form');
  if (!form) {
    return;
  }

  if (form.action.includes('formspree.io')) {
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setError(fieldName, message) {
    const errorEl = form.querySelector(`[data-error-for="${fieldName}"]`);
    const input = form.elements[fieldName];
    if (errorEl) {
      errorEl.textContent = message;
    }
    if (input) {
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  }

  function clearErrors() {
    ['fullName', 'email', 'automationGoal'].forEach((field) => setError(field, ''));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();

    const fullName = form.elements.fullName.value.trim();
    const businessName = form.elements.businessName.value.trim();
    const email = form.elements.email.value.trim();
    const phone = form.elements.phone.value.trim();
    const automationGoal = form.elements.automationGoal.value.trim();
    const contactMethod = form.elements.contactMethod.value;

    let hasError = false;

    if (!fullName) {
      setError('fullName', 'Please enter your full name.');
      hasError = true;
    }

    if (!email) {
      setError('email', 'Please enter your email address.');
      hasError = true;
    } else if (!emailPattern.test(email)) {
      setError('email', 'Please enter a valid email format.');
      hasError = true;
    }

    if (!automationGoal) {
      setError('automationGoal', 'Please describe what you want to automate.');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    const success = document.getElementById('form-success');
    const fallback = document.getElementById('mailto-fallback');

    const subject = `Consulting Inquiry - ${businessName || fullName}`;
    const body = [
      `Full Name: ${fullName}`,
      `Business Name: ${businessName || 'N/A'}`,
      `Email: ${email}`,
      `Phone: ${phone || 'N/A'}`,
      `Preferred Contact Method: ${contactMethod}`,
      '',
      'Automation Goal:',
      automationGoal,
    ].join('\n');

    const mailtoHref = `mailto:hello@example.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    if (success) {
      success.textContent = 'Thanks — I’ll reply within 1 business day.';
    }

    if (fallback) {
      fallback.innerHTML = `If your mail client does not open automatically, use this <a href="${mailtoHref}">email fallback link</a>.`;
    }

    form.reset();
  });
})();
