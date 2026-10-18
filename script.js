/* ============================================================
   Экспресс-ДЗ — логика сайта
   ------------------------------------------------------------
   Список фотографий сайт получает автоматически:
   1) запрашивает /api/photos — сервер сам сканирует папки
      предметов (достаточно положить фото и обновить страницу);
   2) если API недоступен (например, страница открыта как файл
      без сервера) — используется manifest.js как запасной список.

   Имена файлов фотографий: ДДММГГГГ + номер + расширение
   Пример: 220920261.png = 22 сентября 2026 года, фото №1
   Сортировка: сначала более новые даты,
   внутри одной даты — меньший номер выше.
   ============================================================ */

(function () {
  'use strict';

  var MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  var EXT_RE = /\.(png|jpe?g|webp|gif)$/i;

  /* ---------- Элементы ---------- */

  var select = document.getElementById('subject-select');
  var chooseBtn = document.getElementById('choose-btn');
  var gallery = document.getElementById('gallery');
  var galleryTitle = document.getElementById('subject-title');
  var photoCount = document.getElementById('photo-count');
  var emptyState = document.getElementById('empty-state');
  var emptyTitle = document.getElementById('empty-title');
  var emptyText = document.getElementById('empty-text');

  var lightbox = document.getElementById('lightbox');
  var lbImg = document.getElementById('lightbox-img');
  var lbCaption = document.getElementById('lightbox-caption');
  var lbCounter = document.getElementById('lightbox-counter');
  var lbPrev = document.getElementById('lightbox-prev');
  var lbNext = document.getElementById('lightbox-next');
  var lbClose = document.getElementById('lightbox-close');
  var lbOrigin = document.getElementById('lightbox-origin');

  /* ---------- Состояние ---------- */

  var manifest = null;      // { предмет: [имена файлов] }
  var currentSubject = null;
  var currentPhotos = [];   // [{ name, url, info }]
  var lbIndex = 0;
  var lastFocused = null;

  /* ---------- Загрузка списка фотографий ---------- */

  function loadManifest() {
    // 1) пробуем сервер (автоматическое чтение папок)
    return fetch('/api/photos', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        manifest = data && Object.keys(data).length ? data : null;
      })
      .catch(function () {
        // 2) запасной вариант — статический manifest.js
        manifest = (typeof window !== 'undefined' && window.MANIFEST)
          ? window.MANIFEST
          : null;
      });
  }

  /* ---------- Разбор имени файла ---------- */

  function parseFileName(fileName) {
    var dot = fileName.lastIndexOf('.');
    var base = dot > 0 ? fileName.slice(0, dot) : fileName;
    if (!/^\d{8,}$/.test(base)) return null;

    var day = parseInt(base.slice(0, 2), 10);
    var month = parseInt(base.slice(2, 4), 10);
    var year = parseInt(base.slice(4, 8), 10);
    var num = base.length > 8 ? parseInt(base.slice(8), 10) : 0;

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (year < 1990 || year > 2100) return null;

    return {
      day: day,
      month: month,
      year: year,
      num: num,
      time: new Date(year, month - 1, day).getTime()
    };
  }

  function formatDate(info) {
    if (!info) return 'Дата неизвестна';
    return info.day + ' ' + MONTHS[info.month - 1] + ' ' + info.year;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function shortDate(info) {
    if (!info) return '—';
    return pad2(info.day) + '.' + pad2(info.month) + '.' + info.year;
  }

  /* Сортировка: новее — выше; внутри даты меньший номер — выше */
  function sortPhotos(list) {
    list.sort(function (a, b) {
      if (a.info && b.info) {
        if (b.info.time !== a.info.time) return b.info.time - a.info.time;
        return a.info.num - b.info.num;
      }
      if (a.info) return -1;
      if (b.info) return 1;
      return a.name.localeCompare(b.name, 'ru');
    });
    return list;
  }

  function buildPhotoList(subject) {
    var files = ((manifest && manifest[subject]) || []).filter(function (f) {
      return EXT_RE.test(f);
    });
    return sortPhotos(files.map(function (name) {
      return {
        name: name,
        url: encodeURI(subject + '/' + name),
        info: parseFileName(name)
      };
    }));
  }

  /* ---------- Загрузка предмета ---------- */

  function fillSelect() {
    select.innerHTML = '';
    Object.keys(manifest).forEach(function (subject) {
      var opt = document.createElement('option');
      opt.value = subject;
      opt.textContent = subject;
      select.appendChild(opt);
    });
  }

  function showError(message) {
    gallery.innerHTML = '';
    emptyState.hidden = false;
    emptyTitle.textContent = 'Что-то пошло не так';
    emptyText.textContent = message;
    galleryTitle.textContent = 'Ошибка';
    photoCount.hidden = true;
  }

  function renderEmpty(subject) {
    gallery.innerHTML = '';
    emptyState.hidden = false;
    emptyTitle.textContent = 'Пока нет ответов на задания';
    emptyText.textContent = 'По предмету «' + subject +
      '» фотографии появятся здесь, как только их добавят. Загляните позже!';
  }

  function loadSubject(subject) {
    if (!subject) return;
    currentSubject = subject;
    select.value = subject;

    var photos = buildPhotoList(subject);
    currentPhotos = photos;

    galleryTitle.textContent = subject;
    document.title = subject + ' — Экспресс-ДЗ';

    if (!photos.length) {
      photoCount.hidden = true;
      renderEmpty(subject);
      return;
    }

    emptyState.hidden = true;
    photoCount.hidden = false;
    photoCount.textContent = photos.length + ' фото';

    gallery.innerHTML = '';

    photos.forEach(function (photo, i) {
      gallery.appendChild(createCard(photo, i));
    });
  }

  /* ---------- Карточка фото: дата НАД фотографией ---------- */

  var ERROR_IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">' +
    '<rect width="100%" height="100%" fill="#f1eef9"/>' +
    '<text x="50%" y="46%" font-family="Arial, sans-serif" font-size="24" fill="#8a84a3" text-anchor="middle">Не удалось</text>' +
    '<text x="50%" y="56%" font-family="Arial, sans-serif" font-size="24" fill="#8a84a3" text-anchor="middle">загрузить фото</text>' +
    '</svg>'
  );

  function createCard(photo, index) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'photo-card';
    btn.style.animationDelay = Math.min(index * 45, 400) + 'ms';
    btn.setAttribute('aria-label', 'Открыть фото от ' + formatDate(photo.info) +
      (photo.info ? ', номер ' + photo.info.num : ''));

    /* дата над фотографией — из имени файла */
    var dateRow = document.createElement('div');
    dateRow.className = 'card-date';

    var dateText = document.createElement('span');
    dateText.className = 'date-text';
    dateText.textContent = formatDate(photo.info);
    dateRow.appendChild(dateText);

    if (photo.info) {
      var dateNum = document.createElement('span');
      dateNum.className = 'date-num';
      dateNum.textContent = '№' + photo.info.num;
      dateRow.appendChild(dateNum);
    }

    var frame = document.createElement('div');
    frame.className = 'photo-frame';

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = 'Домашнее задание, ' + formatDate(photo.info);
    img.src = photo.url;

    img.addEventListener('load', function () {
      img.classList.add('loaded');
      frame.classList.add('has-img');
    });
    img.addEventListener('error', function () {
      if (img.src !== ERROR_IMG) {
        img.src = ERROR_IMG;
        img.classList.add('loaded');
        frame.classList.add('has-img');
      }
    });

    frame.appendChild(img);
    btn.appendChild(dateRow);
    btn.appendChild(frame);

    btn.addEventListener('click', function () {
      openLightbox(index);
    });

    return btn;
  }

  /* ---------- Лайтбокс ---------- */

  function openLightbox(index) {
    if (!currentPhotos.length) return;
    lbIndex = index;
    lastFocused = document.activeElement;
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    updateLightbox();
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('lightbox-open');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function updateLightbox() {
    var photo = currentPhotos[lbIndex];
    if (!photo) return;
    lbImg.src = photo.url;
    lbImg.alt = 'Домашнее задание, ' + formatDate(photo.info);
    lbCaption.textContent = currentSubject + ' — ' + formatDate(photo.info) +
      (photo.info ? ', фото №' + photo.info.num : '');
    lbCounter.textContent = (lbIndex + 1) + ' / ' + currentPhotos.length;
    lbOrigin.href = photo.url;
    var many = currentPhotos.length > 1;
    lbPrev.style.display = many ? '' : 'none';
    lbNext.style.display = many ? '' : 'none';
  }

  function step(dir) {
    var n = currentPhotos.length;
    if (!n) return;
    lbIndex = (lbIndex + dir + n) % n;
    updateLightbox();
  }

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', function () { step(-1); });
  lbNext.addEventListener('click', function () { step(1); });
  lightbox.querySelector('[data-close]').addEventListener('click', closeLightbox);

  document.addEventListener('keydown', function (e) {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  /* свайп на телефоне */
  var touchX = null;
  lightbox.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) touchX = e.touches[0].clientX;
  }, { passive: true });

  lightbox.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) step(dx > 0 ? -1 : 1);
  }, { passive: true });

  /* ---------- Кнопка «Выбрать» ---------- */

  chooseBtn.addEventListener('click', function () {
    loadSubject(select.value);
  });

  /* ---------- Запуск ---------- */

  loadManifest().then(function () {
    if (!manifest || !Object.keys(manifest).length) {
      showError('Сайт не смог получить список фотографий. Откройте сайт через сервер и убедитесь, что папки предметов на месте.');
      return;
    }
    fillSelect();
    loadSubject(Object.keys(manifest)[0]);   // при открытии показываем первый предмет
  });
})();
