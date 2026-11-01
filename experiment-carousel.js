const gallery = document.querySelector('[data-carousel]');

if (gallery) {
  const slides = [...gallery.querySelectorAll('.experiment-entry')];
  const controls = gallery.querySelector('.carousel-controls');
  const counter = gallery.querySelector('.carousel-counter');
  let current = 0;

  function showSlide(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, position) => {
      slide.hidden = position !== current;
    });
    counter.textContent = `${current + 1} / ${slides.length}`;
  }

  if (slides.length && controls && counter) {
    gallery.querySelector('[data-previous]').addEventListener('click', () => showSlide(current - 1));
    gallery.querySelector('[data-next]').addEventListener('click', () => showSlide(current + 1));
    gallery.addEventListener('keydown', (event) => {
      if (event.target.closest('input, textarea, select, [contenteditable]')) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      showSlide(current + (event.key === 'ArrowRight' ? 1 : -1));
    });

    gallery.setAttribute('role', 'region');
    gallery.setAttribute('aria-roledescription', 'carousel');
    gallery.setAttribute('aria-label', 'Experiment 1 photographs');
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
