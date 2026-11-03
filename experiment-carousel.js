const gallery = document.querySelector('[data-carousel]');

if (gallery) {
  const slides = [...gallery.querySelectorAll('.experiment-entry')];
  const controls = gallery.querySelector('.carousel-controls');
  const counter = gallery.querySelector('.carousel-counter');
  let current = 0;

  function updateGalleryLayout() {
    const image = slides[current].querySelector(':scope > figure img');
    gallery.closest('.experiment-layout')?.classList.toggle(
      'single-portrait-active', Boolean(image && image.naturalWidth > 0 && image.naturalWidth < image.naturalHeight)
    );
  }

  function showSlide(index, reveal = false) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, position) => {
      slide.hidden = position !== current;
    });
    updateGalleryLayout();
    counter.textContent = `${current + 1} / ${slides.length}`;
    if (reveal && gallery.closest('.experiment-memory-two') && gallery.getBoundingClientRect().top < 0) {
      gallery.scrollIntoView({ block: 'start' });
    }
  }

  if (slides.length && controls && counter) {
    gallery.addEventListener('load', updateGalleryLayout, true);
    gallery.querySelector('[data-previous]').addEventListener('click', () => showSlide(current - 1, true));
    gallery.querySelector('[data-next]').addEventListener('click', () => showSlide(current + 1, true));
    gallery.addEventListener('keydown', (event) => {
      if (event.target.closest('input, textarea, select, [contenteditable]')) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      showSlide(current + (event.key === 'ArrowRight' ? 1 : -1), true);
    });

    gallery.setAttribute('role', 'region');
    gallery.setAttribute('aria-roledescription', 'carousel');
    gallery.setAttribute('aria-label', gallery.getAttribute('aria-label') || 'Experiment 1 photographs');
    gallery.tabIndex = 0;
    slides.forEach((slide, position) => {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', `${position + 1} of ${slides.length}`);
    });
    showSlide(0);
    gallery.classList.add('carousel-enabled');
    controls.hidden = false;
  }
}

(() => {
  function initializeReflectionReference() {
    const layout = document.querySelector('.experiment-layout');
    const gallery = layout?.querySelector(':scope > .experiment-gallery');
    const introduction = layout?.querySelector(':scope > .experiment-introduction');
    const heading = document.querySelector('.site-header > h1');
    const reference = document.querySelector('[data-reflections-reference]');
    if (!gallery || !introduction || !heading || !reference) return false;

    const titleRow = document.createElement('div');
    titleRow.className = 'experiment-title-row';
    heading.before(titleRow);
    titleRow.append(heading);
    let frame = 0;

    function positionReference() {
      frame = 0;
      const stacked = introduction.getBoundingClientRect().top >= gallery.getBoundingClientRect().bottom - 1;
      const destination = stacked ? introduction : titleRow;
      if (reference.parentElement === destination) return;
      const focused = reference.contains(document.activeElement) ? document.activeElement : null;
      if (stacked) introduction.prepend(reference);
      else titleRow.append(reference);
      focused?.focus({ preventScroll: true });
    }

    function schedulePosition() {
      if (!frame) frame = requestAnimationFrame(positionReference);
    }

    const observer = new ResizeObserver(schedulePosition);
    for (const element of [layout, gallery, introduction]) observer.observe(element);
    schedulePosition();
    return true;
  }

  if (!initializeReflectionReference()) {
    document.addEventListener('site-header-ready', initializeReflectionReference, { once: true });
  }
})();
