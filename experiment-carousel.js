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
