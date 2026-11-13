const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const navbar = $('#navbar');
const burger = $('#burger-btn');
const navLinks = $('#nav-links');
const bookingCard = $('#booking-card');
const bookingSuccess = $('#booking-success');
const bookingDate = $('#booking-date');
const HAIRCUT_PRICE = 120;
let currentStep = 1;
let pendingReceipt = '';

window.addEventListener('scroll', () => {
  navbar?.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

burger?.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(isOpen));
});

if ('IntersectionObserver' in window) {
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      $$('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach(section => spy.observe(section));
}

$$('.nav-link').forEach(link => link.addEventListener('click', () => {
  navLinks?.classList.remove('open');
  burger?.setAttribute('aria-expanded', 'false');
}));

async function apiRequest(url, options = {}) {
  const headers = { ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';
  const token = sessionStorage.getItem('gupit-admin-token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The server request failed.');
  return result;
}

function storeImage(key, source) {
  try {
    localStorage.setItem(key, source);
    return true;
  } catch {
    showToast('This browser is out of photo storage. Remove old gallery photos and try again.');
    return false;
  }
}

function showToast(message) {
  const container = $('#toast-container') || document.body;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function goStep(step) {
  const target = Math.max(1, Math.min(4, Number(step) || 1));
  if (target > currentStep) {
    if (currentStep === 1 && !$('.service-opt.selected')) {
      showToast('Choose a haircut to continue.');
      return;
    }
    if (currentStep === 2 && !$('.barber-opt.selected')) {
      showToast('Choose a barber to continue.');
      return;
    }
    if (currentStep === 3 && (!bookingDate.value || !$('.time-slot.selected'))) {
      showToast('Choose a date and time to continue.');
      return;
    }
  }
  currentStep = target;
  if (target === 4) {
    $('#conf-service').textContent = $('.service-opt.selected')?.dataset.service || '—';
    $('#conf-price').textContent = `₱${HAIRCUT_PRICE}`;
    $('#conf-barber').textContent = $('.barber-opt.selected')?.dataset.barber || '—';
    $('#conf-date').textContent = bookingDate.value
      ? new Date(`${bookingDate.value}T12:00:00`).toLocaleDateString()
      : '—';
    $('#conf-time').textContent = $('.time-slot.selected')?.dataset.time || '—';
  }
  $$('.booking-step').forEach((stepElement, index) => {
    stepElement.classList.toggle('hidden', index !== target - 1);
  });
  $$('.steps-bar .step').forEach((indicator, index) => {
    indicator.classList.toggle('active', index === target - 1);
    indicator.classList.toggle('done', index < target - 1);
  });
}

window.goStep = goStep;

function setSelectableCards(selector, selectedClass) {
  $$(selector).forEach(card => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', 'false');
    const select = () => {
      $$(selector).forEach(option => {
        option.classList.remove(selectedClass);
        option.setAttribute('aria-pressed', 'false');
      });
      card.classList.add(selectedClass);
      card.setAttribute('aria-pressed', 'true');
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
  });
}

setSelectableCards('.service-opt', 'selected');
setSelectableCards('.barber-opt', 'selected');

async function updateTimeSlots() {
  const date = bookingDate.value;
  if (!date) {
    $$('.time-slot').forEach(slot => {
      slot.disabled = false;
      slot.classList.remove('taken');
    });
    return;
  }
  let takenTimes;
  try {
    const result = await apiRequest(`/api/booked-slots?date=${encodeURIComponent(date)}`);
    takenTimes = new Set(result.times);
  } catch {
    showToast('Could not load available times. Please try again.');
    return;
  }
  if (bookingDate.value !== date) return;
  $$('.time-slot').forEach(slot => {
    const taken = takenTimes.has(slot.dataset.time);
    slot.disabled = taken;
    slot.classList.toggle('taken', taken);
    if (taken) slot.classList.remove('selected');
  });
}

if (bookingDate) {
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
  bookingDate.min = localToday;
  bookingDate.addEventListener('change', updateTimeSlots);
}

$$('.time-slot').forEach(slot => slot.addEventListener('click', () => {
  if (slot.disabled) return;
  $$('.time-slot').forEach(option => option.classList.remove('selected'));
  slot.classList.add('selected');
}));

$$('.pay-toggle').forEach(button => button.addEventListener('click', () => {
  $$('.pay-toggle').forEach(option => option.classList.remove('active'));
  button.classList.add('active');
  const isGcash = button.dataset.pay === 'GCash';
  $('#receipt-upload-wrap').classList.toggle('hidden', !isGcash);
  if (!isGcash) {
    pendingReceipt = '';
    $('#customer-receipt').value = '';
    $('#customer-receipt-preview').src = '';
    $('#customer-receipt-preview').classList.add('hidden');
    $('#receipt-file-name').textContent = 'Upload a screenshot or photo of your payment receipt.';
  } else {
    openGcashModal();
  }
}));

$('#customer-receipt')?.addEventListener('change', function () {
  readImage(this.files[0], source => {
    pendingReceipt = source;
    $('#customer-receipt-preview').src = source;
    $('#customer-receipt-preview').classList.remove('hidden');
    $('#receipt-file-name').textContent = this.files[0].name;
  });
});

async function submitBooking() {
  const name = $('#cust-name').value.trim();
  const phone = $('#cust-phone').value.trim();
  const date = bookingDate.value;
  const time = $('.time-slot.selected')?.dataset.time || '';
  const service = $('.service-opt.selected')?.dataset.service || '';
  const barber = $('.barber-opt.selected')?.dataset.barber || '';
  const payment = $('.pay-toggle.active')?.dataset.pay || 'Cash';

  if (!name || !phone || !date || !time || !service || !barber) {
    showToast('Complete each booking step before confirming.');
    return;
  }
  if (payment === 'GCash' && !pendingReceipt) {
    showToast('Upload your GCash receipt before confirming.');
    $('#customer-receipt').focus();
    return;
  }
  let booking;
  try {
    booking = await apiRequest('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        name, phone, date, time, service, barber, payment,
        amount: HAIRCUT_PRICE,
        receipt: payment === 'GCash' ? pendingReceipt : ''
      })
    });
  } catch (error) {
    if (error.message.includes('already booked')) {
      await updateTimeSlots();
      showToast(error.message);
      goStep(3);
      return;
    }
    showToast(error.message);
    return;
  }
  $('#success-msg').textContent = `Thanks, ${name}. Your ₱${HAIRCUT_PRICE} appointment is reserved.`;
  $('#success-detail').innerHTML = [
    `<strong>${escapeHtml(service)}</strong> with ${escapeHtml(barber)}`,
    `${escapeHtml(date)} at ${escapeHtml(time)}`,
    `Haircut price: ₱${HAIRCUT_PRICE}`,
    `Payment: ${escapeHtml(payment)}`
  ].join('<br>');
  bookingCard.classList.add('hidden');
  bookingSuccess.classList.remove('hidden');
  showToast('Booking confirmed. See you soon!');
}

window.submitBooking = submitBooking;
window.resetBooking = () => {
  $('#cust-name').value = '';
  $('#cust-phone').value = '';
  pendingReceipt = '';
  $('#customer-receipt').value = '';
  $('#customer-receipt-preview').src = '';
  $('#customer-receipt-preview').classList.add('hidden');
  $('#receipt-upload-wrap').classList.add('hidden');
  $('#receipt-file-name').textContent = 'Upload a screenshot or photo of your payment receipt.';
  bookingDate.value = '';
  $$('.service-opt, .barber-opt').forEach(option => {
    option.classList.remove('selected');
    option.setAttribute('aria-pressed', 'false');
  });
  $$('.time-slot').forEach(slot => slot.classList.remove('selected'));
  $$('.pay-toggle').forEach(button => button.classList.toggle('active', button.dataset.pay === 'Cash'));
  bookingSuccess.classList.add('hidden');
  bookingCard.classList.remove('hidden');
  updateTimeSlots();
  goStep(1);
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function readImage(file, callback) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please choose an image file.');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const image = new Image();
    image.addEventListener('load', () => {
      const scale = Math.min(1, 1200 / image.width, 1200 / image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.78));
    });
    image.src = reader.result;
  });
  reader.readAsDataURL(file);
}

const cutImageFiles = {
  buzzcut: 'buzzcut.jpg', taper: 'taper-fade.jpg', drop: 'drop-fade.jpg',
  twoblock: 'two-block.jpg', mullet: 'modern-mullet.jpg', mood: 'moodcut.jpg'
};

$$('.cut-upload').forEach(input => {
  const card = document.getElementById(input.dataset.card);
  const photoArea = $('.cut-photo-area', card);
  const image = document.createElement('img');
  image.className = 'cut-real-img';
  image.alt = `${input.dataset.id} haircut style`;
  image.src = localStorage.getItem(`cut-photo-${input.dataset.id}`) || `assets/cuts/${cutImageFiles[input.dataset.id]}`;
  photoArea.insertBefore(image, $('.cut-no-photo', photoArea));
  $('.cut-no-photo', photoArea).classList.add('hidden');
});

$$('.service-opt').forEach(option => {
  const price = document.createElement('div');
  price.className = 'svc-price';
  price.textContent = `₱${HAIRCUT_PRICE}`;
  option.appendChild(price);
});

$$('.cut-upload').forEach(input => input.addEventListener('change', function () {
  if (!document.body.classList.contains('admin-active')) return;
  readImage(this.files[0], source => {
    const card = document.getElementById(this.dataset.card);
    const photoArea = $('.cut-photo-area', card);
    let image = $('.cut-real-img', photoArea);
    image.src = source;
    storeImage(`cut-photo-${this.dataset.id}`, source);
    $('.cut-no-photo', photoArea).classList.add('hidden');
    showToast('Haircut photo added.');
  });
}));

$$('.barber-up').forEach(input => input.addEventListener('change', function () {
  if (!document.body.classList.contains('admin-active')) return;
  readImage(this.files[0], source => {
    const image = $(`#bimg-${this.dataset.bid}`);
    image.src = source;
    storeImage(`barber-photo-${this.dataset.bid}`, source);
    image.classList.remove('hidden');
    $(`#bi-${this.dataset.bid}`).classList.add('hidden');
    showToast('Barber photo updated.');
  });
}));

$$('.barber-up').forEach(input => {
  const source = localStorage.getItem(`barber-photo-${input.dataset.bid}`);
  if (!source) return;
  $(`#bimg-${input.dataset.bid}`).src = source;
  $(`#bimg-${input.dataset.bid}`).classList.remove('hidden');
  $(`#bi-${input.dataset.bid}`).classList.add('hidden');
});

const galleryInput = $('#gallery-input');
const galleryPhotosGrid = $('#gallery-photos-grid');
const galleryVideosFeed = $('#gallery-videos-feed');
const galleryPhotosEmpty = $('#gallery-photos-empty');
const galleryVideosEmpty = $('#gallery-videos-empty');
const galleryDrop = $('#gallery-drop');
const galleryCaption = $('#gallery-caption');
const galleryFileName = $('#gallery-file-name');
const galleryPostButton = $('#gallery-post-btn');
const galleryVideosViewport = $('#gallery-videos-viewport');
const galleryVideoPrevious = $('#gallery-video-prev');
const galleryVideoNext = $('#gallery-video-next');
const galleryAudioPlayers = new WeakMap();
let selectedGalleryFile = null;
let galleryActiveAudioVideo = null;
let galleryAudioRequested = false;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  $$('.gallery-video-item video').forEach(video => video.play().catch(() => {}));
  if (galleryAudioRequested && galleryActiveAudioVideo) playGalleryAudio(galleryActiveAudioVideo);
});

function syncGalleryAudio(video) {
  const audio = galleryAudioPlayers.get(video);
  if (!audio || audio.paused) return;
  if (Math.abs(audio.currentTime - video.currentTime) > 0.3) audio.currentTime = video.currentTime;
  audio.playbackRate = video.playbackRate;
}

function playGalleryAudio(video) {
  const audio = galleryAudioPlayers.get(video);
  if (!audio) return;
  galleryVideosFeed.querySelectorAll('video').forEach(otherVideo => {
    if (otherVideo !== video) galleryAudioPlayers.get(otherVideo)?.pause();
  });
  galleryActiveAudioVideo = video;
  galleryAudioRequested = true;
  audio.currentTime = video.currentTime;
  audio.playbackRate = video.playbackRate;
  audio.volume = 1;
  audio.play().catch(() => {
    showToast('Audio could not start. Check your device volume and try again.');
  });
}

function updateGalleryCarouselControls() {
  const videos = galleryVideosFeed.querySelectorAll('.gallery-video-item');
  const maxScroll = galleryVideosViewport.scrollWidth - galleryVideosViewport.clientWidth;
  galleryVideoPrevious.disabled = videos.length < 2 || galleryVideosViewport.scrollLeft <= 2;
  galleryVideoNext.disabled = videos.length < 2 || galleryVideosViewport.scrollLeft >= maxScroll - 2;
}

function scrollGalleryVideos(direction) {
  const firstCard = galleryVideosFeed.querySelector('.gallery-video-item');
  if (!firstCard) return;
  const gap = Number.parseFloat(getComputedStyle(galleryVideosFeed).gap) || 0;
  galleryVideosViewport.scrollBy({
    left: direction * (firstCard.getBoundingClientRect().width + gap),
    behavior: 'smooth'
  });
}

galleryVideoPrevious.addEventListener('click', () => scrollGalleryVideos(-1));
galleryVideoNext.addEventListener('click', () => scrollGalleryVideos(1));
galleryVideosViewport.addEventListener('scroll', updateGalleryCarouselControls, { passive: true });
window.addEventListener('resize', updateGalleryCarouselControls, { passive: true });

function renderGalleryPost(post) {
  const item = document.createElement('article');
  item.className = `gallery-item${post.type === 'video' ? ' gallery-video-item' : ''}`;
  const media = post.type === 'video' ? document.createElement('video') : document.createElement('img');
  media.className = 'gallery-media';
  media.src = post.mediaData;
  
  if (post.type === 'video') {
    media.controls = false;
    media.playsInline = true;
    media.autoplay = true;
    media.muted = true;
    media.loop = true;
    media.preload = 'auto';
    media.setAttribute('aria-label', 'Gupit Xpress haircut video');
    const audio = new Audio(post.mediaData);
    audio.preload = 'metadata';
    audio.loop = true;
    audio.volume = 1;
    galleryAudioPlayers.set(media, audio);
    audio.addEventListener('play', () => { media.dataset.audioPlaying = 'true'; });
    audio.addEventListener('pause', () => { media.dataset.audioPlaying = 'false'; });
    media.addEventListener('click', () => playGalleryAudio(media));
    media.addEventListener('timeupdate', () => syncGalleryAudio(media));
    media.addEventListener('seeking', () => syncGalleryAudio(media));
    media.addEventListener('ratechange', () => syncGalleryAudio(media));
    media.addEventListener('pause', () => galleryAudioPlayers.get(media)?.pause());
    
    const frame = document.createElement('div');
    frame.className = 'gallery-video-frame';
    frame.append(media);
    item.appendChild(frame);
  } else {
    media.alt = 'Gupit Xpress haircut';
    media.addEventListener('click', () => openLightbox(post.mediaData));
    item.appendChild(media);
  }
  
  if (post.caption && post.caption.trim() !== '') {
    const caption = document.createElement('p');
    caption.className = 'gallery-caption';
    caption.textContent = post.caption;
    item.appendChild(caption);
  }

  if (document.body.classList.contains('admin-active')) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'del-btn gallery-delete';
    remove.title = 'Delete gallery post';
    remove.setAttribute('aria-label', 'Delete gallery post');
    remove.textContent = '×';
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this post? This cannot be undone.')) return;
      try {
        await apiRequest(`/api/admin/gallery/${encodeURIComponent(post.id)}`, { method: 'DELETE' });
        item.remove();
        updateGalleryEmptyStates();
        showToast('Gallery post deleted.');
      } catch (error) {
        showToast(error.message);
      }
    });
    item.appendChild(remove);
  }
  
  const targetGrid = post.type === 'video' ? galleryVideosFeed : galleryPhotosGrid;
  targetGrid.appendChild(item);
  updateGalleryEmptyStates();
  
  if (post.type === 'video') {
    media.play().catch(() => {});
    updateGalleryCarouselControls();
  }
}

function updateGalleryEmptyStates() {
  galleryPhotosEmpty.classList.toggle('hidden', galleryPhotosGrid.querySelector('.gallery-item') !== null);
  galleryVideosEmpty.classList.toggle('hidden', galleryVideosFeed.querySelector('.gallery-item') !== null);
}

async function loadGallery() {
  try {
    const { posts } = await apiRequest('/api/gallery');
    galleryPhotosGrid.querySelectorAll('.gallery-item').forEach(item => item.remove());
    galleryVideosFeed.querySelectorAll('.gallery-item').forEach(item => item.remove());
    posts.forEach(renderGalleryPost);
    updateGalleryEmptyStates();
    updateGalleryCarouselControls();
  } catch {
    showToast('Could not load gallery posts. Please refresh the page.');
  }
}

function selectGalleryFile(file) {
  if (!file) return;
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
  if (!isImage && !isVideo) {
    showToast('Choose a JPG, PNG, WebP, MP4, WebM, or MOV file.');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('Media must be 20 MB or smaller.');
    return;
  }
  selectedGalleryFile = file;
  galleryFileName.textContent = file.name;
}

galleryInput?.addEventListener('change', function () {
  selectGalleryFile(this.files[0]);
});

galleryPostButton?.addEventListener('click', async () => {
  if (!document.body.classList.contains('admin-active')) {
    showToast('Only shop admins can post to the gallery.');
    return;
  }
  if (!selectedGalleryFile) {
    showToast('Choose a photo or video to post.');
    return;
  }
  const file = selectedGalleryFile;
  galleryPostButton.disabled = true;
  try {
    let mediaData;
    let mediaType = file.type;
    if (file.type.startsWith('image/')) {
      mediaData = await new Promise(resolve => readImage(file, resolve));
      mediaType = 'image/jpeg';
    } else {
      mediaData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result));
        reader.addEventListener('error', () => reject(new Error('Could not read that video file.')));
        reader.readAsDataURL(file);
      });
    }
    const { post } = await apiRequest('/api/admin/gallery', {
      method: 'POST',
      body: JSON.stringify({
        type: file.type.startsWith('video/') ? 'video' : 'image',
        mediaType,
        mediaData,
        caption: galleryCaption.value.trim()
      })
    });
    renderGalleryPost(post);
    selectedGalleryFile = null;
    galleryInput.value = '';
    galleryFileName.textContent = 'No media selected';
    galleryCaption.value = '';
    showToast('Post added to the gallery.');
  } catch (error) {
    showToast(error.message);
  } finally {
    galleryPostButton.disabled = false;
  }
});

loadGallery();

galleryDrop?.addEventListener('dragover', event => {
  if (!document.body.classList.contains('admin-active')) return;
  event.preventDefault();
  galleryDrop.classList.add('drag-over');
});
galleryDrop?.addEventListener('dragleave', () => galleryDrop.classList.remove('drag-over'));
galleryDrop?.addEventListener('drop', event => {
  if (!document.body.classList.contains('admin-active')) return;
  event.preventDefault();
  galleryDrop.classList.remove('drag-over');
  selectGalleryFile(event.dataTransfer.files[0]);
});

function openLightbox(source) {
  const overlay = $('#lb-overlay');
  $('#lb-img').src = source;
  overlay.classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeLightbox() {
  $('#lb-overlay').classList.add('hidden');
  document.body.classList.remove('modal-open');
}
window.closeLb = closeLightbox;
$('#lb-overlay')?.addEventListener('click', event => {
  if (event.target === event.currentTarget || event.target.id === 'lb-close-btn') closeLightbox();
});

function openGcashModal() {
  $('#gcash-modal').classList.remove('hidden');
  $('#gcash-modal').classList.add('active');
  document.body.classList.add('modal-open');
}
function closeGcashModal() {
  $('#gcash-modal').classList.add('hidden');
  $('#gcash-modal').classList.remove('active');
  document.body.classList.remove('modal-open');
}
window.openGcash = openGcashModal;
window.openGcashModal = openGcashModal;
window.closeGcash = closeGcashModal;
$('#gcash-modal')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) closeGcashModal();
});

$('#gcash-qr-img').src = 'assets/cuts/gcash-qr.jpg';
$('#gcash-qr-img').classList.remove('hidden');
$('#qr-placeholder').classList.add('hidden');

let selectedRating = 0;
const ratingInput = $('#rv-rating');
$$('.star-btn').forEach(star => {
  const setRating = value => {
    selectedRating = value;
    ratingInput.value = String(value);
    $$('.star-btn').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.v) <= value);
      button.setAttribute('aria-pressed', String(Number(button.dataset.v) === value));
    });
  };
  star.addEventListener('click', () => setRating(Number(star.dataset.v)));
  star.setAttribute('aria-pressed', 'false');
});

function createReviewCard(review) {
  const details = [review.haircut, review.barber].filter(Boolean).join(' · ') || 'General review';
  const card = document.createElement('article');
  card.className = 'rv-card';
  card.innerHTML = `
    <div class="rv-top">
      <div class="rv-av">${escapeHtml(review.name.charAt(0).toUpperCase())}</div>
      <div class="rv-meta"><div class="rv-name">${escapeHtml(review.name)}</div>
        <div class="rv-info">${escapeHtml(details)}</div></div>
      <div class="rv-stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
    </div>
    <p class="rv-text">"${escapeHtml(review.message)}"</p>
    <div class="rv-date">${new Date(review.createdAt).toLocaleDateString()}</div>`;
  return card;
}

async function loadReviews() {
  try {
    const { reviews } = await apiRequest('/api/reviews');
    reviews.slice().reverse().forEach(review => $('#reviews-feed').prepend(createReviewCard(review)));
  } catch {
    showToast('Could not load saved reviews. Please refresh the page.');
  }
}

loadReviews();

$('#review-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('#rv-name').value.trim() || 'Anonymous';
  const message = $('#rv-msg').value.trim();
  if (!message || selectedRating === 0) {
    showToast('Add a rating and a short review first.');
    return;
  }
  try {
    const { review } = await apiRequest('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        name,
        message,
        rating: selectedRating,
        haircut: $('#rv-cut').value,
        barber: $('#rv-barber').value
      })
    });
    $('#reviews-feed').prepend(createReviewCard(review));
  } catch (error) {
    showToast(error.message);
    return;
  }
  $('#review-form').reset();
  selectedRating = 0;
  ratingInput.value = '0';
  $$('.star-btn').forEach(button => {
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
  });
  showToast('Thanks for sharing your review.');
});

let adminBookings = [];
const adminPanel = $('#admin-panel');
const adminFab = $('#admin-fab');

const icon = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const pad2 = value => String(value).padStart(2, '0');
const peso = value => `₱${Number(value || 0).toLocaleString()}`;
const localDateString = (date = new Date()) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const statusBadge = booking => booking.served
  ? '<span class="queue-status complete">Served</span>'
  : '<span class="queue-status">Waiting</span>';

function openAdminView() {
  adminPanel.classList.remove('hidden');
  adminFab.classList.add('hidden');
  document.body.classList.add('admin-open');
}

function closeAdminView() {
  adminPanel.classList.add('hidden', 'adm-side-closed');
  adminPanel.classList.remove('adm-side-open');
  document.body.classList.remove('admin-open');
  if (document.body.classList.contains('admin-active')) adminFab.classList.remove('hidden');
}

function emptyState(title, text) {
  return `<div class="adm-empty">${icon('list')}<strong>${title}</strong><span>${text}</span></div>`;
}

function renderStats(bookings, waiting) {
  const total = bookings.reduce((sum, booking) => sum + Number(booking.amount || HAIRCUT_PRICE), 0);
  const today = localDateString();
  const todayCount = bookings.filter(booking => booking.date === today).length;
  const cards = [
    ['users', 'Waiting', waiting.length, 'Customers in queue', 'warn'],
    ['check', 'Served', bookings.length - waiting.length, 'Completed haircuts', 'ok'],
    ['calendar', 'Today', todayCount, 'Bookings for today', ''],
    ['list', 'Total bookings', bookings.length, 'All saved records', ''],
    ['cash', 'Booked total', peso(total), 'Sum of booking amounts', 'accent']
  ];
  $('#admin-stats').innerHTML = cards.map(([ic, label, value, note, tone]) => `
    <div class="admin-stat ${tone}">
      <div class="admin-stat-ic">${icon(ic)}</div>
      <div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>
    </div>`).join('');
}

function renderNext(waiting) {
  const next = waiting[0];
  if (!next) {
    $('#admin-next').innerHTML = `<div class="adm-panel-head"><div><h3>Next customer</h3><p>Who to call next</p></div></div>${emptyState('Queue is clear', 'No customers are waiting right now.')}`;
    return;
  }
  $('#admin-next').innerHTML = `
    <div class="adm-panel-head"><div><h3>Next customer</h3><p>First waiting customer in queue order</p></div></div>
    <div class="next-card">
      <div class="next-num"><span>Queue</span><strong>#${pad2(next.queueNum)}</strong></div>
      <div class="next-info">
        <h4>${escapeHtml(next.name)}</h4>
        <a href="tel:${escapeHtml(next.phone)}">${icon('phone')} ${escapeHtml(next.phone)}</a>
        <ul>
          <li>${icon('scissors')} ${escapeHtml(next.service)} · ${peso(next.amount || HAIRCUT_PRICE)}</li>
          <li>${icon('user')} ${escapeHtml(next.barber)}</li>
          <li>${icon('calendar')} ${escapeHtml(next.date)} at ${escapeHtml(next.time)}</li>
          <li>${icon('cash')} ${escapeHtml(next.payment || 'Cash')}</li>
        </ul>
      </div>
      <button class="btn-red queue-call-btn" type="button" data-booking-id="${escapeHtml(next.id)}">Call next ${icon('arrow-right')}</button>
    </div>`;
}

function renderInsights(bookings) {
  if (!bookings.length) {
    $('#admin-insights').innerHTML = `<div class="adm-panel-head"><div><h3>Booking breakdown</h3><p>By barber and payment method</p></div></div>${emptyState('No data yet', 'Charts appear after the first booking.')}`;
    return;
  }
  const byBarber = {};
  bookings.forEach(booking => {
    const key = booking.barber || 'Unassigned';
    byBarber[key] = byBarber[key] || { waiting: 0, served: 0 };
    byBarber[key][booking.served ? 'served' : 'waiting'] += 1;
  });
  const max = Math.max(...Object.values(byBarber).map(item => item.waiting + item.served));
  const barberRows = Object.entries(byBarber).sort((a, b) => (b[1].waiting + b[1].served) - (a[1].waiting + a[1].served)).map(([name, item]) => `
    <div class="bar-row">
      <div class="bar-top"><strong>${escapeHtml(name)}</strong><span>${item.waiting} waiting · ${item.served} served</span></div>
      <div class="bar-track"><i class="bar-served" style="width:${(item.served / max) * 100}%"></i><i class="bar-waiting" style="width:${(item.waiting / max) * 100}%"></i></div>
    </div>`).join('');
  const pay = { Cash: 0, GCash: 0 };
  bookings.forEach(booking => { const key = booking.payment === 'GCash' ? 'GCash' : 'Cash'; pay[key] += 1; });
  $('#admin-insights').innerHTML = `
    <div class="adm-panel-head"><div><h3>Booking breakdown</h3><p>By barber and payment method</p></div></div>
    <div class="bar-list">${barberRows}</div>
    <div class="pay-split">
      <div>${icon('cash')}<span>Cash</span><strong>${pay.Cash}</strong></div>
      <div>${icon('mobile')}<span>GCash</span><strong>${pay.GCash}</strong></div>
    </div>`;
}

function renderQueueList(waiting) {
  if (!waiting.length) {
    $('#admin-queue-list').innerHTML = emptyState('No customers waiting', 'New appointments will appear here in queue order.');
    return;
  }
  $('#admin-queue-list').innerHTML = `<ol class="queue-list">${waiting.map((booking, index) => `
    <li class="queue-item ${index === 0 ? 'is-next' : ''}">
      <div class="queue-no">#${pad2(booking.queueNum)}</div>
      <div class="queue-who">
        <strong>${escapeHtml(booking.name)} ${index === 0 ? '<em class="next-pill">Next</em>' : ''}</strong>
        <a href="tel:${escapeHtml(booking.phone)}">${escapeHtml(booking.phone)}</a>
      </div>
      <div class="queue-what"><span>${escapeHtml(booking.service)}</span><small>${escapeHtml(booking.barber)}</small></div>
      <div class="queue-when"><span>${escapeHtml(booking.date)}</span><small>${escapeHtml(booking.time)}</small></div>
      <div class="queue-act"><button class="btn-red btn-sm queue-call-btn" type="button" data-booking-id="${escapeHtml(booking.id)}">Call next</button></div>
    </li>`).join('')}</ol>`;
}

function renderRecords() {
  const query = ($('#rec-search')?.value || '').trim().toLowerCase();
  const status = $('#rec-filter')?.value || 'all';
  const rows = adminBookings.filter(booking => {
    if (status === 'waiting' && booking.served) return false;
    if (status === 'served' && !booking.served) return false;
    if (!query) return true;
    return [booking.name, booking.phone, booking.service, booking.barber, booking.date, booking.time, booking.payment]
      .join(' ').toLowerCase().includes(query);
  });
  if (!adminBookings.length) {
    $('#queue-container').innerHTML = emptyState('No bookings yet', 'New appointments will appear here.');
    return;
  }
  if (!rows.length) {
    $('#queue-container').innerHTML = emptyState('No matching records', 'Try a different search or status filter.');
    return;
  }
  const body = rows.map(booking => `
    <tr class="${booking.served ? 'served' : ''}">
      <td data-label="Queue"><strong class="q-num">#${pad2(booking.queueNum)}</strong></td>
      <td data-label="Customer"><div><strong>${escapeHtml(booking.name)}</strong><a href="tel:${escapeHtml(booking.phone)}">${escapeHtml(booking.phone)}</a></div></td>
      <td data-label="Haircut"><div>${escapeHtml(booking.service)}<small>${peso(booking.amount || HAIRCUT_PRICE)}</small></div></td>
      <td data-label="Barber">${escapeHtml(booking.barber)}</td>
      <td data-label="Date / time"><div>${escapeHtml(booking.date)}<small>${escapeHtml(booking.time)}</small></div></td>
      <td data-label="Payment">${escapeHtml(booking.payment || 'Cash')}</td>
      <td data-label="Receipt">${booking.receipt ? `<button class="receipt-view-btn" type="button" data-receipt-id="${escapeHtml(booking.id)}">View receipt</button>` : '<span class="receipt-missing">Not provided</span>'}</td>
      <td data-label="Status">${statusBadge(booking)}</td>
      <td data-label="Action" class="td-actions">
        ${booking.served ? '' : `<button class="btn-red btn-sm queue-call-btn" type="button" data-booking-id="${escapeHtml(booking.id)}">Call next</button>`}
        <button class="queue-record-delete" type="button" data-booking-id="${escapeHtml(booking.id)}" aria-label="Delete record for ${escapeHtml(booking.name)}">${icon('trash')} Delete</button>
      </td>
    </tr>`).join('');
  $('#queue-container').innerHTML = `
    <table class="queue-table">
      <thead><tr><th>Queue</th><th>Customer</th><th>Haircut</th><th>Barber</th><th>Date / time</th><th>Payment</th><th>Receipt</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="table-foot">Showing ${rows.length} of ${adminBookings.length} record${adminBookings.length === 1 ? '' : 's'}</p>`;
}

async function renderQueue() {
  if (!document.body.classList.contains('admin-active')) return;
  let bookings;
  try {
    ({ bookings } = await apiRequest('/api/admin/bookings'));
  } catch (error) {
    if (error.message.includes('admin session has expired')) {
      sessionStorage.removeItem('gupit-admin-token');
      document.body.classList.remove('admin-active', 'admin-open');
      adminPanel.classList.add('hidden');
      adminFab.classList.add('hidden');
    }
    showToast(error.message);
    return;
  }
  adminBookings = bookings;
  const waiting = bookings.filter(booking => !booking.served).sort((a, b) => a.queueNum - b.queueNum);
  $('#adm-count-waiting').textContent = String(waiting.length);
  $('#adm-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  renderStats(bookings, waiting);
  renderNext(waiting);
  renderInsights(bookings);
  renderQueueList(waiting);
  renderRecords();
}

adminPanel?.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.classList.contains('queue-refresh')) {
    await renderQueue();
    showToast('Dashboard refreshed.');
    return;
  }
  if (button.classList.contains('queue-delete-period')) {
    const days = button.dataset.period === 'week' ? 7 : 30;
    if (!window.confirm(`Erase customer records created in the last ${days} days? This cannot be undone.`)) return;
    try {
      await apiRequest(`/api/admin/bookings?period=${button.dataset.period}`, { method: 'DELETE' });
      await renderQueue();
      await updateTimeSlots();
      showToast(`Records from the last ${days} days were erased.`);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (button.classList.contains('receipt-view-btn')) {
    const booking = adminBookings.find(item => item.id === button.dataset.receiptId);
    if (!booking?.receipt || !document.body.classList.contains('admin-active')) return;
    $('#admin-receipt-image').src = booking.receipt;
    $('#receipt-preview-modal').classList.remove('hidden');
    $('#receipt-preview-modal').classList.add('active');
    document.body.classList.add('modal-open');
    return;
  }
  if (button.classList.contains('queue-call-btn')) {
    const booking = adminBookings.find(item => item.id === button.dataset.bookingId);
    if (!booking) return;
    try {
      await apiRequest(`/api/admin/bookings/${encodeURIComponent(booking.id)}/serve`, { method: 'POST' });
      await renderQueue();
      await updateTimeSlots();
      showToast(`Called ${booking.name}, queue #${pad2(booking.queueNum)}.`);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (button.classList.contains('queue-record-delete')) {
    const booking = adminBookings.find(item => item.id === button.dataset.bookingId);
    if (!booking || !window.confirm(`Delete the customer record for ${booking.name}? This cannot be undone.`)) return;
    try {
      await apiRequest(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, { method: 'DELETE' });
      await renderQueue();
      await updateTimeSlots();
      showToast('Customer record deleted.');
    } catch (error) {
      showToast(error.message);
    }
  }
});

$('#rec-search')?.addEventListener('input', renderRecords);
$('#rec-filter')?.addEventListener('change', renderRecords);

function setSidebarOpen(open) {
  adminPanel.classList.toggle('adm-side-open', open);
  $('#adm-menu-btn')?.setAttribute('aria-expanded', String(open));
}
$('#adm-menu-btn')?.addEventListener('click', () => setSidebarOpen(!adminPanel.classList.contains('adm-side-open')));
$('#adm-scrim')?.addEventListener('click', () => setSidebarOpen(false));

$$('[data-adm-target]').forEach(link => link.addEventListener('click', () => {
  document.getElementById(link.dataset.admTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setSidebarOpen(false);
}));

$$('[data-site-target]').forEach(link => link.addEventListener('click', () => {
  closeAdminView();
  window.setTimeout(() => document.getElementById(link.dataset.siteTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}));

$('#adm-gcash')?.addEventListener('click', () => { closeAdminView(); openGcashModal(); });
$('#adm-view-site')?.addEventListener('click', () => { closeAdminView(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
adminFab?.addEventListener('click', () => { openAdminView(); renderQueue(); });

$('#adm-content')?.addEventListener('scroll', () => {
  const content = $('#adm-content');
  let current = 'adm-overview';
  ['adm-overview', 'adm-queue', 'adm-records'].forEach(id => {
    const section = document.getElementById(id);
    if (section && section.offsetTop - content.scrollTop <= 140) current = id;
  });
  $$('[data-adm-target]').forEach(link => link.classList.toggle('active', link.dataset.admTarget === current));
}, { passive: true });

function activateAdmin() {
  document.body.classList.add('admin-active');
  $$('.cut-no-photo').forEach(control => control.classList.remove('hidden'));
  loadGallery();
  renderQueue();
  $('#admin-login-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
  adminPanel.classList.remove('adm-side-closed');
  openAdminView();
}

$('#admin-open-link')?.addEventListener('click', event => {
  event.preventDefault();
  if (document.body.classList.contains('admin-active')) {
    openAdminView();
    renderQueue();
    return;
  }
  $('#admin-login-modal').classList.remove('hidden');
  $('#admin-login-modal').classList.add('active');
  document.body.classList.add('modal-open');
  $('#admin-passcode').focus();
});

$('#admin-login-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const passcode = $('#admin-passcode').value;
  try {
    const { token } = await apiRequest('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ passcode })
    });
    sessionStorage.setItem('gupit-admin-token', token);
    activateAdmin();
    $('#admin-passcode').value = '';
  } catch (error) {
    showToast(error.message);
    $('#admin-passcode').select();
    return;
  }
});

$('#pw-toggle')?.addEventListener('click', () => {
  const field = $('#admin-passcode');
  const show = field.type === 'password';
  field.type = show ? 'text' : 'password';
  $('#pw-toggle').textContent = show ? 'Hide' : 'Show';
  $('#pw-toggle').setAttribute('aria-label', show ? 'Hide passcode' : 'Show passcode');
});

$('#admin-login-close')?.addEventListener('click', () => {
  $('#admin-login-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
});

$('#admin-login-modal')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) {
    event.currentTarget.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }
});

function returnToCustomerView() {
  sessionStorage.removeItem('gupit-admin-token');
  document.body.classList.remove('admin-active', 'admin-open');
  adminPanel.classList.add('hidden');
  adminFab.classList.add('hidden');
  $$('.cut-no-photo').forEach(control => control.classList.add('hidden'));
  loadGallery();
  window.location.hash = 'home';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#admin-back-customer')?.addEventListener('click', returnToCustomerView);

$('#receipt-preview-close')?.addEventListener('click', () => {
  $('#receipt-preview-modal').classList.add('hidden');
  $('#receipt-preview-modal').classList.remove('active');
  document.body.classList.remove('modal-open');
});

$('#receipt-preview-modal')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) {
    event.currentTarget.classList.add('hidden');
    event.currentTarget.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
});

if (sessionStorage.getItem('gupit-admin-token')) activateAdmin();

$('#confirm-book-btn')?.addEventListener('click', event => {
  event.preventDefault();
  submitBooking();
});

$('#pay-gcash-card')?.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openGcashModal();
  }
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeGcashModal();
    closeLightbox();
    $('#receipt-preview-close')?.click();
    $('#admin-login-modal')?.classList.add('hidden');
    if (adminPanel) adminPanel.classList.remove('adm-side-open');
  }
});
document.querySelectorAll('.remove-photo-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    const bid = this.dataset.bid;
    localStorage.removeItem(`barber-photo-${bid}`);
    
    const image = document.getElementById(`bimg-${bid}`);
    const initials = document.getElementById(`bi-${bid}`);
    
    if (image && initials) {
      image.src = '';
      image.classList.add('hidden');
      initials.classList.remove('hidden');
    }
    
    showToast('Barber photo removed.');
  });
});
updateTimeSlots();